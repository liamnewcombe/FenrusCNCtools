/*
    Copyright (C) 2020 -- Arjan van de Ven
    
    Licensed under the terms of the GPL-3.0 license
*/


let xoffset = 0.0;
let yoffset = 0.0;
let array_xmax;
let array_ymax;
let global_maxX = 0.0;
let global_maxY = 0.0;
let global_maxZ = 0.0;
let global_maxZlevel = 0.0;
let global_minX = 5000000.0;
let global_minY = 5000000.0;
let global_minZ = 5000000.0;
let currentx = 0.0;
let currenty = 0.0;
let currentz = 0.0;
let currentf = 0.0;
let currentfset = 0.0;
let diameter = 0.0;
let depthofcut = 0.0;
let array2D;
let glevel = '0';
let filename = "output.nc";
let speedlimit = 100.0;
let dryrun = 1;
let isF360 = 0;

let scalefactor = 3.0;

let maxload = 1500;

let outputtext = "";



let optimization_retract = 1;
let optimization_rapidtop = 1;
let optimization_rapidplunge = 1;

let count_retract = 0;
let count_rapidtop = 0;
let count_rapidplunge = 0;


function allocate_2D_array(minX, minY, maxX, maxY) {
	xoffset = - Math.floor(minX / 5.0);
	yoffset = - Math.floor(minY / 5.0);
	array_xmax = yoffset + Math.ceil(maxX / 5.0) + 4
	array_ymax = yoffset + Math.ceil(maxY / 5.0) + 4
	
	var x, y;

	array2D = new Array(array_ymax + 1)
	for (y = 0; y <= array_ymax; y++) {
		array2D[y] = new Array(array_xmax + 1)
		for (x = 0; x <= array_xmax; x++) {
			array2D[y][x] = [];
		}	
	}
	
}


function Position(X, Y, Z) {
	this.X = X;
	this.Y = Y;
	this.Z = Z;
}

function record_move_to(X, Y, Z) 
{

	if (dryrun > 0) {
		return;
	}
	var move = new Position(X, Y, Z);
	
	var minx, miny;
	
	minx = Math.floor(X/5.0) + xoffset;
	miny = Math.floor(Y/5.0) + yoffset;
	
	if (minx < 0) minx = 0;
	if (miny < 0) miny = 0;
	if (minx >= array_xmax) minx = array_xmax - 1;
	if (miny >= array_ymax) miny = array_ymax - 1;
	array2D[miny][minx].push(move);
}

/*
 * returns the depth at a specific X,Y given past cuts.
 * once a cut at "threshold" depth is found, the search is stopped
 * as the objective has been reached
 */
function depth_at_XY(X, Y, threshold)
{
	var depth = global_maxZ;
	var m;
	
	
	var ax, ay;
	
	ax = Math.floor(X/5.0) + xoffset;
	ay = Math.floor(Y/5.0) + yoffset;
	
	if (ax < 0) ax = 0;
	if (ay < 0) ay = 0;
	if (ax >= array_xmax) ax = array_xmax - 1;
	if (ay >= array_ymax) ay = array_ymax - 1;
	
	var arr = array2D[ay][ax];
	
	var len = arr.length -1;
	
	for (var i = len; i >= 0; i--) {
		m = arr[i];
		var d;

		if (X == m.X && Y == m.Y)
			depth = Math.min(depth, m.Z);
	}

	return depth;
}


function emit_output(line)
{
	outputtext = outputtext + line;
	if (!line.includes("\n")) {
		outputtext = outputtext + "\n";
	}
}


function G0(x, y, z, feed) 
{

	global_maxX = Math.max(global_maxX, x);
	global_maxY = Math.max(global_maxY, y);
	global_maxZ = Math.max(global_maxZ, z);
	global_minX = Math.min(global_minX, x);
	global_minY = Math.min(global_minY, y);
	global_minZ = Math.min(global_minZ, z);
	/* If there are rapids below the total maxZ... that counts */
	if ((currentx != x || currenty != y) && z < global_maxZ) {
		global_maxZlevel = Math.max(global_maxZlevel, z);
	}
	
	let s = "G0";
	if (x != currentx)
		s += "X" + x.toFixed(4);
	if (y != currenty)
		s += "Y" + y.toFixed(4);
	if (z != currentz)
		s += "Z" + z.toFixed(4);
	if (feed != currentf)
		s += "F" + feed.toFixed(4);
		
		
	emit_output(s);
	
	currentx = x;
	currenty = y;
	currentz = z;
	currentf = feed;
}


function G1(x, y, z, feed) 
{
	let orgfeed = feed;
	global_maxX = Math.max(global_maxX, x);
	global_maxY = Math.max(global_maxY, y);
	global_maxZ = Math.max(global_maxZ, z);
	if (currentx != x || currenty != y) {
		global_maxZlevel = Math.max(global_maxZlevel, z);
	}
	global_minX = Math.min(global_minX, x);
	global_minY = Math.min(global_minY, y);
	global_minZ = Math.min(global_minZ, z);
	
	let s = "G1";
	
	if (optimization_retract == 1 && x == currentx && y == currenty && z > currentz) {
		s = "G0";
		count_retract++;
	}
	
	if (optimization_rapidtop == 1 && z >= global_maxZlevel) {
		s = "G0";
		count_rapidtop++;
	}
	
	if (optimization_rapidplunge == 1 && dryrun == 0) {
		if (currentx == x && currenty == y && z < currentz) {
			let targetZ = depth_at_XY(x, y) + 0.2;
			targetZ = Math.max(targetZ, z);
			if (targetZ < currentz) {
				let s2 = "G0Z" + targetZ.toFixed(4);
				emit_output(s2);
				count_rapidplunge++;
			}
		}
		record_move_to(x, y, z);
	}
	
	
	if (x != currentx)
		s += "X" + x.toFixed(4);
	if (y != currenty)
		s += "Y" + y.toFixed(4);
	if (z != currentz)
		s += "Z" + z.toFixed(4);
	if (feed != currentf)
		s += "F" + feed.toFixed(4);
	
	emit_output(s);
	
	currentx = x;
	currenty = y;
	currentz = z;
	currentf = feed;
}

function handle_M_line(line)
{
	emit_output(line);
	/* lines we can ignore */
	if (line == "M05") {
		return;
	}
	if (line == "M02")
		return;
		
	if (line.includes("M6"))
		return tool_change(line);
}

function handle_comment(line)
{
	emit_output(line);
	if (line.includes("Fusion 360")) {
		isF360 = 1;
	}
	if (line.includes("stockMax:")) {
		l = line.replace("(stockMax:","");
		global_maxX = parseFloat(l);
		let idx = l.indexOf(",");
		l = l.substring(idx + 1);
		global_maxY = parseFloat(l);
		idx = l.indexOf(",");
		l = l.substring(idx + 1);
		global_maxZ = parseFloat(l);
		global_maxZlevel = global_maxZ + 0.0001;
//		console.log("new maX/Y " + global_maxX+ " " + global_maxY + "\n");		
	}
	
	if (line.includes("(TOOL/MILL,")) {
		lastmillline = line;
		l = line.replace("(TOOL/MILL,","");
		diameter = parseFloat(l);
	}
}

function handle_XYZ_line(line)
{
	let newX, newY, newZ, newF;
	newX = currentx;
	newY = currenty;
	newZ = currentz;
	newF = currentf;
	let idx;
		
	idx = line.indexOf("X");
	if (idx >= 0) {
		newX = parseFloat(line.substring(idx + 1));	
	}
	idx = line.indexOf("Y");
	if (idx >= 0)
		newY = parseFloat(line.substring(idx + 1));	
	idx = line.indexOf("Z");
	if (idx >= 0)
		newZ = parseFloat(line.substring(idx + 1));	
	idx = line.indexOf("F")
	if (idx >= 0) {
		newF = parseFloat(line.substring(idx + 1));	
		if (newF == 0) /* Bug in f360*/
			newF == currentf;
	}


	global_maxX = Math.max(global_maxX, newX);
	global_maxY = Math.max(global_maxY, newY);
	global_maxZ = Math.max(global_maxZ, newZ);
	
	if ((newX != currentx || newY != currenty) && glevel != '0') {
		global_maxZlevel = Math.max(global_maxZlevel, newZ);
	}
	
	global_minX = Math.min(global_minX, newX);
	global_minY = Math.min(global_minY, newY);
	global_minZ = Math.min(global_minZ, newZ);

	/* arc commands are pass through */
	if (glevel == '2' || glevel == '3') {
		emit_output(line);
		currentx = newX;
		currenty = newY;
		currentz = newZ;
		currentf = newF;
		return;
	}
	
	
	if (depthofcut == 0 && newZ < 0)
		depthofcut = -newZ;
		
	if (glevel == '1') 
		G1(newX, newY, newZ, newF);
	else
		G0(newX, newY, newZ, newF);
}

function tool_change(line)
{
	emit_output(line);
}

function handle_G_line(line)
{
	if (line[1] == '3') glevel = '3';
	if (line[1] == '2') glevel = '2';
	if (line[1] == '1') glevel = '1';
	if (line[1] == '0') glevel = '0';
	if (line[1] == '1' || line[1] == '0')
		return handle_XYZ_line(line);

	/* G line we don't need to process, just pass through */
	emit_output(line);
}

function process_line(line)
{
	if (line == "")
		return;
	let code = " ";
	code = line[0];
	
	switch (code) {
		case 'M':
			handle_M_line(line);
			break;
		case '%':
		case '(':
			handle_comment(line);
			break;
		case 'X':
		case 'Y':
		case 'Z':
			handle_XYZ_line(line);
			break;
		case 'G':
			handle_G_line(line);
			break;
		case 'T':
			tool_change(line);
			break;
		case 'S': /* no special handling of S lines yet */
			emit_output(line);
			break;
		case ' ': /* F360 somehow emits blank lies */
		case '':
			handle_comment(line);
			break;
		
		
		default:
			emit_output(line);
			if (line != "" && line != " ") {
				console.log("Unknown code for line -" + line + "-\n");
			}
	}
}


function line_range(lines, start, stop)
{
	for (let i = start; i < stop; i++)
		process_line(lines[i]);
		
	let elem = document.getElementById("Bar");
        elem.style.width = (Math.round(stop/lines.length * 100)) + "%";
        
        if (stop == lines.length) {
	        var link = document.getElementById('download')
	        link.innerHTML = 'save gcode';
	        link.href = "#";
	        link.download = filename;
	        link.href = "data:text/plain;base64," + btoa(outputtext);
	        var pre = document.getElementById('outputpre')
	        pre.innerHTML = outputtext;
	}

}

function log_dimensions()
{
	console.log("Detected dimensions:");
	console.log("    X : ", global_minX, " - ", global_maxX);
	console.log("    Y : ", global_minX, " - ", global_maxY);
	console.log("    Z : ", global_minZ, " - ", global_maxZ, "   with movement at ", global_maxZlevel);
}

function log_optimizations()
{
	console.log("Optimization statistic");
	console.log("   retract-to-G0 optimization      :", count_retract);
	console.log("   rapids at top of design         :", count_rapidtop);
	console.log("   rapid plunge                    :", count_rapidplunge);
}


function process_data(data)
{
    let lines = data.split("\n")
    let len = lines.length;
    
    var start;
    
    array2D = [];
    xoffset = 0.0;
    yoffset = 0.0;
    global_maxX = -500000.0;
    global_maxY = -500000.0;
    global_maxZ = -500000.0;
    global_maxZlevel = -500000.0;
    global_minX = 5000000.0;
    global_minY = 5000000.0;
    global_minZ = 5000000.0;
    currentx = 0.0;
    currenty = 0.0;
    currentz = 0.0;
    currentf = 0.0;
    diameter = 0.0;
    glevel = '0';
    let stepsize = 1;
    
    console.log("Data is " + lines[0] + " size  " + lines.length);
    
    start = Date.now();
    
    console.log("Start of parsing at " + (Date.now() - start));

    /* first a quick dryrun to find the size of the work*/
    dryrun = 1;    
    for (let i = 0; i < len; i++) {
    	process_line(lines[i]);
    }
    outputtext = "";
    count_retract = 0;
    count_rapidtop = 0;
    count_rapidplunge = 0;
    
    if (global_maxZlevel < 0.04) {
    	global_maxZlevel = global_maxZ;
    }
    
    log_dimensions();
    allocate_2D_array(global_minX, global_minY, global_maxX, global_maxY);
    /* and then for real */
    dryrun = 0;    
    stepsize = Math.round((lines.length + 1)/100);
    if (stepsize < 1)
    	stepsize = 1;
    for (let i = 0; i < len; i += stepsize) {
    	let end = i + stepsize;
    	if (end > lines.length)
    		end = lines.length;
	setTimeout(line_range, 0, lines, i, end);
    }
    
//    for (let i = 0; i < len; i++) {
//    	process_line(lines[i]);
//    }

    setTimeout(log_optimizations, 0);
    console.log("End of parsing at " + (Date.now() - start));
}


function load(evt) 
{
    var start;
    start =  Date.now();
    if (evt.target.readyState == FileReader.DONE) {
        process_data(evt.target.result); console.log("End of data processing " + (Date.now() - start));
    }    
}

function basename(path) {
     return path.replace(/.*\//, '');
}

function handle(e) 
{
    var files = this.files;
    for (var i = 0, f; f = files[i]; i++) {
    	let fn = basename(f.name);
    	if (fn != "" && fn.includes(".nc")) {
    		filename = fn.replace(".nc", "-out.nc");
    	}
        var reader = new FileReader();
        reader.onloadend = load;
        reader.readAsText(f);
    }
}

function Speedlimit(value)
{
    let newlimit = parseFloat(value);
    
    if (newlimit > 0 && newlimit < 500) {
    	speedlimit = newlimit;
    }
}


document.getElementById('files').onchange = handle;


function optRetract(value)
{
	if (value == true) {
		optimization_retract = 1;
	}
	if (value == false) {
		optimization_retract = 0;
	}
	console.log("optimization_retract is set to ", optimization_retract);
}

function optRapidTop(value)
{
	if (value == true) {
		optimization_rapidtop = 1;
	}
	if (value == false) {
		optimization_rapidtop = 0;
	}
	console.log("optimization_rapidtop is set to ", optimization_rapidtop);
}

function optRapidPlunge(value)
{
	if (value == true) {
		optimization_rapidplunge = 1;
	}
	if (value == false) {
		optimization_rapidplunge = 0;
	}
	console.log("optimization_rapidplunge is set to ", optimization_rapidplunge);
}

window.optRetract = optRetract;
window.optRapidTop = optRapidTop;
window.optRapidPlunge = optRapidPlunge;