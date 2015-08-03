/*  
 * Grooves class.   Contains some common grooves that is used to populate the grooves menu
 *
 *
 */

if (typeof (grooves) === "undefined") var grooves = {};

(function() { "use strict";

	var root = grooves;

	root.Rock_Grooves = {
		'8th Note Rock':  '?Div=8&Swing=0&measures=2&showMeasures=1&H=|xxxxxxxx|xxxxxxxx|&S=|--o---o-|--o---o-|&K=|o---o---|o---o---|',
		'16th Note Rock': '?Div=16&Swing=0&measures=2&showMeasures=1&H=|xxxxxxxxxxxxxxxx|xxxxxxxxxxxxxxxx|&S=|----o-------o---|----o-------o---|&K=|o-------o-------|o-------o-------|',
	};

	root.Triplet_Grooves = {
		'Half Time Shuffle in 8th notes': '?Div=12&Title=Half%20Time%20Shuffle&Swing=0&measures=2&showMeasures=1&H=|x-xx-xx-xx-x|x-xx-xx-xx-x|&S=|-g--g-Og--g-|-g--g-Og--g-|&K=|------------|------------|',
		'Half Time Shuffle in 16th notes': '?Div=24&Swing=0&Tempo=85&Measures=2&showMeasures=1&H=|x-xx-xx-xx-xx-xx-xx-xx-x|x-xx-xx-xx-xx-xx-xx-xx-x|&S=|-g--g-Og--g--g--g-Og--g-|-g--g-Og--g--g--g-Og--g-|&K=|------------------------|------------------------|',
	};

	root.Jazz = {
		'Jazz Ride': '?Div=16&Tempo=90&Swing=20&Measures=2&showMeasures=1&H=|r-rrr-rrr-rrr-rr|r-rrr-rrr-rrr-rr|&S=|----------------|----------------|&K=|--x---x---x---x-|--x---x---x---x-|',
	};

	
	root.FullArray = {"Rock grooves":     root.Rock_Grooves,
					 "Triplet grooves":  root.Triplet_Grooves,
					 "Jazz grooves":     root.Jazz,
					};
	
	root.isArray = function (myArray) {
		var str = myArray.constructor.toString();
		return (str.indexOf("Object") > -1);
	};
	
	root.arrayAsHTMLList = function (arrayToPrint) {
		var HTML = '<ul class="grooveListUL">\n';
		for(var key in arrayToPrint) {
			if(root.isArray(arrayToPrint[key])) {
				HTML += '<li class="grooveListHeaderLI">' + key + "</li>\n";
				HTML += root.arrayAsHTMLList(arrayToPrint[key]);
			} else {
				HTML += '<li class="grooveListLI" onClick="myGrooveWriter.loadNewGroove(\'' + arrayToPrint[key] + '\')">' + key + '</li>\n';
			}
		}
		HTML += "</ul>\n";
		
		return HTML;
	};
	
	root.getGroovesAsHTML = function () {
		var HTML = "";
		
		HTML = root.arrayAsHTMLList(root.FullArray);
		
		return HTML;
	};

})();