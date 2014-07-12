/// <reference path="node.d.ts" />
/// <reference path="langdetect.ts" />

module CommandLine {

	var fs = module.require('fs');
	var path = module.require('path');

	var languageProfiles:com.prezi.langdetect.LanguageProfiles = null;

	export function main() {
		// command.addOpt("-d", "directory", "./");
		// command.addOpt("-a", "alpha", "" + DEFAULT_ALPHA);
		// command.addOpt("-s", "seed", null);
		// command.addOpt("-l", "lang", null);

		var command = process.argv[2];
		var profilesDir = process.argv[3];
		if (command == "--detectlang") {
			detectLang(profilesDir, process.argv.slice(4));
		} else if (command == "--batchtest") {
			batchTest();
		}
	}

	function detectLang(profilesDir:string, files:string[]) {
		loadProfilesFromDir(profilesDir);

		for (var i in files) {
			var filename = files[i];
			var data = fs.readFileSync(path.join(__dirname, filename), {encoding:'utf-8'});

			var detector = new com.prezi.langdetect.Detector(languageProfiles);
			detector.appendString(data);
			console.log(filename + ":" + detector.getProbabilities());
		}
	}

	function batchTest() {


	}

	function loadProfilesFromDir(dirname:string) {
		var profilesDir = path.join(__dirname, dirname);
		console.log("Loading profiles from", profilesDir);
		var files = fs.readdirSync(profilesDir);
		var profiles:string[] = [];
		for (var i in files) {
			var filename = path.join(profilesDir, files[i]);
			var data = fs.readFileSync(filename);
			profiles.push(data);
		}

		languageProfiles = com.prezi.langdetect.LanguageProfiles.loadFromJsonStrings(profiles);
	}
}

CommandLine.main();
