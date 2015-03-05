/*  
 * Grooves class.   Contains some common grooves that is used to populate the grooves menu
 *
 *
 */

if (typeof (grooves) === "undefined") var grooves = {};

(function() { "use strict";

	var root = grooves;

	root.Rock_Grooves = {
		'8th Note Rock':  '?Div=8&Swing=0&measures=2&showMeasures=1&H=|+xxxxxxo|+xxxxxxo|&S=|--o---o-|--o---o-|&K=|o---oo--|o---oo--|',
		'16th Note Rock': '?Div=16&Swing=0&measures=2&showMeasures=1&H=|xxxxxxxxxxxxxxxx|xxxxxxxxxxxxxxxx|&S=|----o-------o---|----o-------o---|&K=|o-----o---o--o--|o-----o---o--o--|',
		'Funk': '?Div=16&Title=Funk&Swing=0&measures=2&showMeasures=1&H=|X-x-X-x-X-x-X-x-|X-x-X-x-X-x-X-x-|&S=|-----g-o-o--x--o|-----g-o-o--x--o|&K=|o-o-------o--o--|o-o-------o--o--|',
		'Basic HipHop': '?Div=8&Swing=0&Title=Basic%20Hip%20Hop&measures=2&showMeasures=1&Tempo=120&H=|xxxxxxxx|xxxxxxxx|&S=|--o---o-|--o---o-|&K=|o--o----|o--o----|',
        'Upbeat Hi-hats':       '?Div=8&Swing=0&Title=Upbeats&measures=2&showMeasures=1&H=|-x-x-x-x|-x-x-x-x|&S=|--o---o-|--o---o-|&K=|o---o---|o---o---|',
		'Syncopated Hi-hats': '?Div=16&Swing=0&Title=Syncopated%20hi-hat&measures=2&showMeasures=1&H=|x-xxx-xxx-xxx-xx|x-xxx-xxx-xxx-xx|&S=|----o-------o---|----o-------o---|&K=|o-------o-------|o-------o-------|',
		'Train Beat':  '?Div=16&Swing=0&Title=Train%20Beat&Tempo=95&Measures=2&showMeasures=1&H=|----------------|----------------|&S=|ggOgggOgggOggOOg|OOOOOOOOOOOOOOOO|&K=|o-x-o-x-o-x-o-x-|o-------o-------|'
	};

	root.Triplet_Grooves = {
		'Half Time Shuffle in 8th notes': '?Div=12&Title=Half%20Time%20Shuffle&Swing=0&measures=2&showMeasures=1&H=|x-xx-xx-xx-x|x-xx-xx-xx-x|&S=|-g--g-Og--g-|-g--g-Og--g-|&K=|------------|------------|',
		'Half Time Shuffle in 16th notes': '?Div=24&Swing=0&Tempo=85&Measures=2&showMeasures=1&H=|x-xx-xx-xx-xx-xx-xx-xx-x|xxxxxxxxxxxxxxxxxxxxxxxx|&S=|-g--g-Og--g--g--g-Og--g-|------O-----------O-----|&K=|------------------------|o-----------o-----------|',
		'Purdie Shuffle':    '?Div=12&Title=Purdie%20Shuffle&Swing=0&measures=2&showMeasures=1&H=|x-xx-xx-xx-x|x-xx-xx-xx-x|&S=|-g--g-Og--g-|-g--g-Og--g-|&K=|o----o-----o|o----o-----o|',
		'Bonham Shuffle':    '?Div=12&Title=Fool%20in%20The%20Rain%20Shuffle&Author=John%20Bonham&Tempo=105&Swing=0&Measures=2&showMeasures=1&H=|x-o+-xx-xx-x|x-xx-xx-xx-x|&S=|-g--g-O---g-|-g--g-Og--g-|&K=|o-o--o-----o|------------|',
		'Rosanna Shuffle':   '?Div=24&Title=Rosanna%20Shuffle&Author=Jeff%20Pocaro&Tempo=85&Swing=0&Measures=2&showMeasures=1&H=|x-xx-xx-xx-xx-xx-xx-xx-x|xxxxxxxxxxxxxxxxxxxxxxxx|&S=|-g--g-Og--g--g--g-Og--g-|------O-----------O-----|&K=|o----o---o----o---o----o|o-----------o-----------|',
	};

	root.Jazz = {
		'Jazz Ride': '?Div=8&Title=Jazz%20Ride%20Pattern&Swing=25&measures=2&showMeasures=1&H=|r-rrr-rr|x-xxx-xx|&S=|--------|--o---o-|&K=|--x---x-|o---o---|',
	};

	root.Latin = {
		'Bossa Nova':  '?Div=8&Title=Bossa%20Nova&Swing=0&measures=2&showMeasures=2&Tempo=130&H=|xxxxxxxx|xxxxxxxx|&S=|--x--x--|x--x--x-|&K=|o-xoo-xo|o-xoo-xo|',
		'Samba Slow':  '?Div=16&Title=Samba&Tempo=80&Swing=0&measures=2&showMeasures=1&H=|xxXxxxXxxxXxxxXx|xxXxxxXxxxXxxxXx|&S=|o-o--o-o-o-o-oo-|o-o--o-o-o-o-oo-|&K=|o--oo--oo--oo--o|o--oo--oo--oo--o|',
		'Samba Fast':  '?Div=16&Title=Samba&Tempo=120&Swing=0&measures=2&showMeasures=1&H=|x-xxx-xxx-xxx-xx|x-xxx-xxx-xxx-xx|&S=|--o--o---o--o-o-|--o--o---o--o-o-|&K=|o-xoo-xoo-xoo-xo|o-xoo-xoo-xoo-xo|',
		'Tumbao':      '?Div=16&Title=Tumbao&Swing=0&measures=2&showMeasures=1&H=|x-xxx-xxx-xxx-xx|x-xxx-xxx-xxx-xx|&S=|----------------|----------------|&K=|o-xo--X-o-xo--X-|o-xo--X-o-xo--X-|',
		'Baiao':       '?Div=16&Title=baiao&Swing=0&measures=2&showMeasures=1&H=|xxX-xxX-xxX-xxX-|xxX-xxX-xxX-xxX-|&S=|------o-------o-|------o-------o-|&K=|o--o----o--o---o|o--o----o--o---o|',
		'Songo':       '?Div=16&Title=Songo&Swing=0&measures=2&showMeasures=1&H=|x---x---x---x---|x---x---x---x---|&S=|--o--o-o-oo--o-o|--o--o-o-oo--o-o|&K=|---o--o----o--o-|---o--o----o--o-|'
	};
	
	root.FullArray = {"Rock grooves":     root.Rock_Grooves,
					 "Triplet grooves":  root.Triplet_Grooves,
					 "Jazz grooves":     root.Jazz,
					 "Latin grooves":	 root.Latin,
					};
	
	root.isArray = function (myArray) {
		var str = myArray.constructor.toString();
		return (str.indexOf("Object") > -1);
	};
	
	root.arrayAsHTMLList = function (arrayToPrint) {
		var HTML = '<ul class="gooveListUL">\n';
		for(var key in arrayToPrint) {
			if(root.isArray(arrayToPrint[key])) {
				HTML += '<li class="gooveListHeaderLI">' + key + "</li>\n";
				HTML += root.arrayAsHTMLList(arrayToPrint[key]);
			} else {
				HTML += '<li class="gooveListLI" onClick="loadNewGroove(\'' + arrayToPrint[key] + '\')">' + key + '</li>\n';
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