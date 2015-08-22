/*
 * Grooves class.   Contains some common grooves that is used to populate the grooves menu
 *
 *
 */

if (typeof(grooves) === "undefined")
	var grooves = {};

(function () {
	"use strict";

	var root = grooves;

	root.Rock_Grooves = {
		'Empty 16th note groove' : '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|----------------|&S=|----------------|&K=|----------------|',
		'8th Note Rock' : '?TimeSig=4/4&Div=8&Tempo=80&Measures=1&H=|xxxxxxxx|&S=|--O---O-|&K=|o---o--|',
		'16th Note Rock' : '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-------o-------|',
		'Syncopated Hi-hats #1' : '?TimeSig=4/4&Div=16&Title=Syncopated%20hi-hats%201&Tempo=80&Measures=1&H=|x-xxx-xxx-xxx-xx|&S=|----O-------O---|&K=|o-------o-------|',
		'Syncopated Hi-hats #2' : '?TimeSig=4/4&Div=16&Title=Syncopated%20hi-hats%202&Tempo=80&Measures=1&H=|xxx-xxx-xxx-xxx-|&S=|----O-------O---|&K=|o-------o-------|',
		'Train Beat' : '?TimeSig=4/4&Div=16&Swing=0&Title=Train%20Beat&Tempo=95&Measures=1&H=|----------------|&S=|ggOgggOgggOggOOg|&K=|o-x-o-x-o-x-o-x-|'
	};

	root.Triplet_Grooves = {
		'Jazz Shuffle' : '?TimeSig=4/4&Div=12&Title=Jazz%20Shuffle&Tempo=100&Measures=1&H=|r--r-rr--r-r|&S=|g-gO-gg-gO-g|&K=|o--X--o--X--|',
		'Half Time Shuffle in 8th notes' : '?TimeSig=4/4&Div=12&Title=Half%20Time%20Shuffle&Swing=0&measures=1&H=|x-xx-xx-xx-x|&S=|-g--g-Og--g-|&K=|------------|',
		'Half Time Shuffle in 16th notes' : '?TimeSig=4/4&Div=24&Swing=0&Tempo=85&Measures=1&H=|x-xx-xx-xx-xx-xx-xx-xx-x|&S=|-g--g-Og--g--g--g-Og--g-|&K=|------------------------|',
		'Purdie Shuffle' : '?TimeSig=4/4&Div=12&Swing=0&Tempo=120&Title=Purdie%20Shuffle&Swing=0&measures=1&H=|x-xx-xx-xx-x|&S=|-g--g-Og--g-|&K=|o----o-----o|',
		'Jazz Ride' : '?TimeSig=4/4&Div=12&Tempo=80&Measures=1&H=|r--r-rr--r-r|&S=|------------|&K=|---x-----x--|'
	};

	root.World_Grooves = {
		'Bossa Nova' : '?TimeSig=4/4&Div=8&Title=Bossa%20Nova&Tempo=140&Measures=2&H=|xxxxxxxx|xxxxxxxx|&S=|x-x--x-x|-x--x-x-|&K=|o-xoo-xo|o-xoo-xo|',
		'Jazz Samba' : '?TimeSig=4/4&Div=16&Title=Samba&Tempo=80&Measures=1&H=|r-rrr-rrr-rrr-rr|&S=|o-o--o-o-o-oo-o-|&K=|o-xoo-xoo-xoo-xo|',
		'Songo' : '?TimeSig=4/4&Div=16&Title=Songo&Tempo=80&Measures=1&&H=|x---x---x---x---|&S=|--O--g-O-gg--g-g|&K=|---o--o----o--o-|'
	};

	root.Foot_Ostinatos = {
		'Samba' : '?TimeSig=4/4&Div=16&Title=Samba Ostinato&Tempo=60&Swing=0&measures=1&H=|----------------|&S=|----------------|&K=|o-xoo-xoo-xoo-xo|',
		'Tumbao' : '?TimeSig=4/4&Div=16&Title=Tumbao Ostinato&Tempo=60&Measures=1&H=|----------------|&S=|----------------|&K=|x--ox-o-x--ox-o-|',
		'Baiao' : '?TimeSig=4/4&Div=16&Title=Baiao Ostinato&Tempo=60&Measures=1&H=|----------------|&S=|----------------|&K=|o-xo--X-o-xo--X-|'
	};

	root.FullArray = {
		"Rock grooves" : root.Rock_Grooves,
		"Triplet grooves" : root.Triplet_Grooves,
		"World grooves" : root.World_Grooves,
		"Foot Ostinatos" : root.Foot_Ostinatos
	};

	root.isArray = function (myArray) {
		var str = myArray.constructor.toString();
		return (str.indexOf("Object") > -1);
	};

	root.arrayAsHTMLList = function (arrayToPrint) {
		var HTML = '<ul class="grooveListUL">\n';
		for (var key in arrayToPrint) {
			if (root.isArray(arrayToPrint[key])) {
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
