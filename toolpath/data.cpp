/*
 * (C) Copyright 2019  -  Arjan van de Ven <arjanvandeven@gmail.com>
 *
 * This file is part of FenrusCNCtools
 *
 * SPDX-License-Identifier: GPL-3.0
 */
#include "tool.h"

#include "scene.h"

extern "C" {
  #include "toolpath.h"
}

static bool compare_shape(class inputshape *A, class inputshape *B)
{
  return (fabs(A->area) < fabs(B->area));
}


double scene::get_minX(void)
{
  return minX;
}
double scene::get_minY(void)
{
  return minY;
}
double scene::get_maxY(void)
{
  return maxY;
}

void scene::declare_minY(double Y)
{
  minY = fmin(Y, minY);
}

void scene::new_poly(double X, double Y)
{
  end_poly();

  shape = new(class inputshape);
  
  add_point_to_poly(X, Y);
}

void scene::set_poly_name(const char *n)
{
  if (!shape)
    shape = new(class inputshape);
  shape->set_name(n);
}

void scene::add_point_to_poly(double X, double Y)
{
  if (!shape)
    shape = new(class inputshape);
    
  shape->add_point(X, Y);
  minX = fmin(X, minX);
  minY = fmin(Y, minY);
  maxX = fmax(X, maxX);
  maxY = fmax(Y, maxY);
}

void scene::end_poly(void)
{
  if (shape) {
    shape->close_shape();
    shapes.push_back(shape);
  }
  shape = NULL;
  sort(shapes.begin(), shapes.end(), compare_shape);
}

void scene::push_tool(int toolnr)
{
  toollist.push_back(toolnr);
}

void scene::set_default_tool(int toolnr)
{
  if (toollist.size() > 0)
    return;
  toollist.push_back(toolnr);
}

void scene::write_svg(const char *filename)
{

  printf("Work size: %5.2f x %5.2f inch\n", mm_to_inch(maxX-minX), mm_to_inch(maxY - minY));
  set_svg_bounding_box(minX, minY, maxX, maxY);
  write_svg_header(filename, 1.0);

  for (auto i : shapes) {
    i->print_as_svg();
  }
  write_svg_footer();
}

void scene::write_gcode(const char *filename)
{
  activate_tool(toollist[0]);
  write_gcode_header(filename);
  unsigned int j;
  
  for (j = 0; j < toollist.size() ; j++) {
    for (auto i : shapes) {
      i->output_gcode(toollist[j]);
    }
    if (j < toollist.size() - 1) {
          gcode_tool_change(toollist[j + 1]);
    }
    
  }
  
  write_gcode_footer();
}


/* input: arbitrary nested vector of shapes */
/* output: odd/even split, max nesting level is 1 */
void scene::flatten_nesting(void)
{
  unsigned int i, j, z;
  for (i = 0; i < shapes.size(); i++) {
    for (j = 0; j < shapes[i]->children.size(); j++) {
      for (z = 0; z < shapes[i]->children[j]->children.size(); z++) {
        shapes.push_back(shapes[i]->children[j]->children[z]);
      }
      shapes[i]->children[j]->wipe_children();
    }
  }
  
}

/* input: a vector of shapes, output: nested shapes are properly parented */
/* This is an O(N^2) algorithm for now */
void scene::process_nesting(void)
{
  unsigned int i;
  /* first sort so that the vector is smallest first */
  /* invariant thus is that a shape can only be inside later shapes in the vector */
  /* in order of nesting */
  sort(shapes.begin(), shapes.end(), compare_shape);

  for (i = 0; i < shapes.size(); i++) {
    unsigned int j;
    for (j = i + 1; j < shapes.size(); j++) {
      if (shapes[i]->fits_inside(shapes[j])) {
//        printf("Adding shape %s (%5.2f) to %s (%5.2f) \n", shapes[i]->name, shapes[i]->area, shapes[j]->name, shapes[j]->area);
        shapes[j]->add_child(shapes[i]);
        shapes.erase(shapes.begin() + i);
        i--;
        break;
      }
    }
  }
  
  flatten_nesting();

  for (i = 0; i < shapes.size(); i++) {
      shapes[i]->set_minY(get_minY());
      shapes[i]->set_level(0);
      shapes[i]->fix_orientation();
  }
}

void scene::create_toolpaths(double depth)
{
  double currentdepth;
  double depthstep;
  double surplus;
  int finish = 0;
  int toolnr;
  int tool;
  
  tool = toollist.size() -1;
  while (tool >= 0) {
    double start, end;
    currentdepth = depth;
    toolnr = toollist[tool];  
    activate_tool(toolnr);
  
    depthstep = get_tool_maxdepth();

    int rounds = (int)ceilf(-depth / depthstep);
    surplus = rounds * depthstep + depth;
  
    /* if we have spare height, split evenly between first and last cut */
    depthstep = depthstep - surplus / 2;


    if (want_finishing_pass()) {
      /* finishing rules: deepest cut is small */
      depthstep = fmin(depthstep, 0.25);
      finish  = 1;
    }
    
    start = 0;
    end = 60000000;
    
    /* we want courser tools to not get within the stepover of the finer tool */
    if (tool < (int)toollist.size() -1)
      start = get_tool_stepover(toollist[tool+1]);
      
    if (tool > 0)
      end = 2 * get_tool_stepover(toollist[tool-1]) + 2 * get_tool_stepover(toollist[tool]);
      
      
    if (tool_is_vcarve(toolnr)) {
        for (auto i : shapes)
          i->create_toolpaths_vcarve(toolnr);
      
    } else {
//      printf("Tool %i goes from %5.2f mm to %5.2f mm\n", toolnr, start, end);
      while (currentdepth < 0) {
        for (auto i : shapes)
          i->create_toolpaths(toolnr, currentdepth, finish, want_inbetween_paths(), start, end, _want_skeleton_paths);
        currentdepth += depthstep;
        depthstep = get_tool_maxdepth();
        if (finish)
          finish = -1;
      }
    }
    
    tool--;
  }
  consolidate_toolpaths();
}
void scene::consolidate_toolpaths(void)
{
  for (auto i : shapes)
    i->consolidate_toolpaths(_want_inbetween_paths);

}

void scene::enable_finishing_pass(void)
{
  _want_finishing_pass = true;
}

bool scene::want_finishing_pass(void)
{
  return _want_finishing_pass;
}

void scene::enable_inbetween_paths(void)
{
  _want_inbetween_paths = true;
}

bool scene::want_inbetween_paths(void)
{
  return _want_inbetween_paths;
}

void scene::enable_skeleton_paths(void)
{
  _want_skeleton_paths = true;
}

bool scene::want_skeleton_paths(void)
{
  return _want_skeleton_paths;
}
