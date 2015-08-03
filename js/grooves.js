/*  
 * Grooves class.   Contains some common grooves that is used to populate the grooves menu
 *
 *
 */

if (typeof (grooves) === "undefined") var grooves = {};

(function() { "use strict";

	var root = grooves;

	root.Rock_Grooves = {
		'8th Note Rock':  '?Div=8&Tempo=80&Measures=1&H=|xxxxxxxx|&S=|--O---O-|&K=|o---oo--|',
		'16th Note Rock': '?Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-----o---o--o--|',
		'Funk': '?Div=16&Title=Funk&Swing=0&measures=1&H=|X-x-X-x-X-x-X-x-|&S=|-----g-o-o--x--o|&K=|o-o-------o--o--|',
		'Basic HipHop': '?Div=8&Title=Basic Hip Hop&Tempo=120&Measures=1&H=|xxxxxxxx|&S=|--O---O-|&K=|o--o----|',
        	'Syncopated Hi-hats': '?Div=16&Title=Syncopated hi-hat&Tempo=80&Measures=1&H=|x-xxx-xxx-xxx-xx|&S=|----O-------O---|&K=|o-------o-------|',
		'Train Beat':  '?Div=16&Swing=0&Title=Train%20Beat&Tempo=95&Measures=1&H=|----------------|&S=|ggOgggOgggOggOOg|&K=|o-x-o-x-o-x-o-x-|'
	};

	root.Triplet_Grooves = {
		'Half Time Shuffle in 8th notes': '?Div=12&Title=Half%20Time%20Shuffle&Swing=0&measures=1&H=|x-xx-xx-xx-x|&S=|-g--g-Og--g-|&K=|------------|',
		'Half Time Shuffle in 16th notes': '?Div=24&Swing=0&Tempo=85&Measures=1&H=|x-xx-xx-xx-xx-xx-xx-xx-x|&S=|-g--g-Og--g--g--g-Og--g-|&K=|------------------------|',
		'Purdie Shuffle':    '?Div=12&Swing=0&Tempo=120&Title=Purdie%20Shuffle&Swing=0&measures=1&H=|x-xx-xx-xx-x|&S=|-g--g-Og--g-|&K=|o----o-----o|',
		'Bonham Shuffle':    '?Div=12&Title=Fool%20in%20The%20Rain%20Shuffle&Author=John%20Bonham&Tempo=105&Swing=0&Measures=1&H=|x-o+-xx-xx-x|&S=|-g--g-O---g-|&K=|o-o--o-----o|',
		
		'Rosanna Shuffle':   '?Div=12&Title=Rosanna Shuffle&Author=Jeff Porcaro&Tempo=170&Measures=2&H=|x-xx-xx-xx-x|x-xx-xx-xx-x|&S=|-g--g-Og--g-|-g--g-Og--g-|&K=|o----o---o--|--o---o----o|',
		//'Rosanna Shuffle in 16ths':   '?Div=24&Title=Rosanna%20Shuffle&Author=Jeff%20Porcaro&Tempo=85&Measures=1&H=|x-xx-xx-xx-xx-xx-xx-xx-x|&S=|-g--g-Og--g--g--g-Og--g-|&K=|o----o---o----o---o----o|'
		'Jazz Ride': '?Div=12&Tempo=80&Measures=1&H=|r--r-rr--r-r|&S=|------------|&K=|---x-----x--|'	
	};


	root.Latin = {
		'Bossa Nova':  '?Div=8&Title=Bossa%20Nova&Swing=0&measures=2&Tempo=130&H=|xxxxxxxx|xxxxxxxx|&S=|--x--x--|x--x--x-|&K=|o-xoo-xo|o-xoo-xo|',
		'Samba Slow':  '?Div=16&Title=Samba&Tempo=80&Swing=0&measures=1&H=|xxXxxxXxxxXxxxXx|&S=|x-x--x-x-x-x-xx-|&K=|o--oo--oo--oo--o|',
		'Samba Fast':  '?Div=16&Title=Samba&Tempo=120&Swing=0&measures=1&H=|x-xxx-xxx-xxx-xx|&S=|--x--x---x--x-x-|&K=|o-xoo-xoo-xoo-xo|',
		'Tumbao':      '?Div=16&Title=Tumbao&Swing=0&measures=1&H=|x-xxx-xxx-xxx-xx|&S=|----------------|&K=|o-xo--X-o-xo--X-|',
		'Baiao':       '?Div=16&Title=baiao&Swing=0&measures=1&H=|xxX-xxX-xxX-xxX-|&S=|------o-------o-|&K=|o--o----o--o---o|',
		'Songo':       '?Div=16&Title=Songo&Tempo=80&Measures=1&&H=|x---x---x---x---|&S=|--O--g-O-gg--g-g|&K=|---o--o----o--o-|'
	};
	
	root.FullArray = {"Rock grooves":     root.Rock_Grooves,
					 "Triplet grooves":  root.Triplet_Grooves,
					 "Latin grooves":	 root.Latin
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