import * as fs from "fs";
import * as path from "path";
const lazy = module.require("lazy");

import { Detector, LanguageProfiles } from "./langdetect";

export function main() {
	var command = process.argv[2];
	var profilesDir = process.argv[3];
	if (command == "--detectlang") {
		detectLang(profilesDir, process.argv.slice(4));
	} else if (command == "--batchtest") {
		batchTest(profilesDir, process.argv.slice(4));
	}
}

function detectLang(profilesDir:string, files:string[]) {
	const languageProfiles = loadProfilesFromDir(profilesDir);

	for (var i in files) {
		var filename = files[i];
		var data = fs.readFileSync(path.join(__dirname, filename), {encoding:'utf-8'});

		var detector = new Detector(languageProfiles);
		detector.appendString(data);
		console.log(filename + ":" + detector.getProbabilities());
	}
}

function batchTest(profilesDir:string, arglist:string[]) {
	const languageProfiles = loadProfilesFromDir(profilesDir);
	var result:{ [s:string]:string[] } = {};
	for (var i in arglist) {
		var filename = arglist[i];

		var stream = fs.createReadStream(path.join(__dirname, filename));
		lazy(stream).lines.forEach(function(buffer:NodeBuffer) {
			var line = buffer.toString('utf-8');
			var idx = line.indexOf('\t');
			if (idx <= 0) {
				return;
			}
			var correctLang = line.substring(0, idx);
			var text = line.substring(idx + 1);

			var detector = new Detector(languageProfiles);
			detector.appendString(text);
			var lang = detector.detect();
			if (!(correctLang in result)) {
				result[correctLang] = [];
			}
			result[correctLang].push(lang);
		});

		stream.on('end', function() {
			var langlist = Object.keys(result).sort();

			var totalCount = 0, totalCorrect = 0;
			for (var i in langlist) {
				var lang = langlist[i];
				var resultCount:{ [s:string]:number } = {};
				var count = 0;
				var list = result[lang];
				for (var j in list) {
					var detectedLang = list[j];
					++count;
					if (detectedLang in resultCount) {
						resultCount[detectedLang] += 1;
					} else {
						resultCount[detectedLang] = 1;
					}
				}
				var correct = resultCount[lang] || 0;
				var rate = correct / count;
				console.log(lang, '(' + correct + '/' + count + '=' + rate.toFixed(2) + '):', resultCount);
				totalCorrect += correct;
				totalCount += count;
			}
			var total = totalCount == 0 ? 0 : (totalCorrect / totalCount);
			console.log("total:", totalCorrect + '/' + totalCount, '=', total.toFixed(3));
		});
	}
}

function loadProfilesFromDir(dirname:string) {
	var profilesDir = path.join(__dirname, dirname);
	console.log("Loading profiles from", profilesDir);
	var files = fs.readdirSync(profilesDir);
	var profiles:string[] = [];
	for (var i in files) {
		var filename = path.join(profilesDir, files[i]);
		var data = fs.readFileSync(filename, "utf8");
		profiles.push(data);
	}

	return LanguageProfiles.loadFromJsonStrings(profiles);
}

main();
