/// <reference path="langdetect.ts" />

module WebInterface {
	function main() {
		document.body.innerHTML = "<h1>Language Detector</h1>";

		var match = new RegExp('languages=([a-z_,]+)').exec(window.location.search) || [];
		var languages = (match[1] || "en,fr,de,hu").split(',');

		var status = document.createElement('div');
		document.body.appendChild(status);

		var box = document.createElement('div');
		box.style.width = '100%';
		box.style.maxWidth = '500px'
		document.body.appendChild(box);

		var textarea = document.createElement('textarea');
		textarea.rows = 10;
		textarea.style.width = '100%';
		box.appendChild(textarea);

		var detectionStatus = document.createElement('div');
		detectionStatus.style.cssFloat = 'left';
		box.appendChild(detectionStatus);

		var detectButton = document.createElement('button');
		detectButton.style.display = 'block';
		detectButton.style.cssFloat = 'right';
		detectButton.textContent = 'Detect';	
		detectButton.disabled = true;
		box.appendChild(detectButton);
		detectButton.addEventListener('click', function() {
			var detector = new com.prezi.langdetect.Detector(loadedLangProfiles);
			detector.appendString(textarea.value);
			var probs = detector.getProbabilities();
			console.log(probs.toString());
			if (probs.length == 0) {
				detectionStatus.textContent = "Detected nothing";
			}
			else {
				detectionStatus.textContent = "Detected: " + probs[0].lang + " (" + probs[0].prob + ")";
			}
		});

		var languagesDownloaded = [];
		var languagesFailed = [];
		var loadedLangProfiles = null;
		var jsonData = [];

		function updateStatus() {
			var languagesDownloading = languages.filter(function(x) {
				return languagesDownloaded.indexOf(x) < 0 && languagesFailed.indexOf(x) < 0;
			});
			if (languagesDownloading.length > 0) {
				status.textContent = "Downloading language profiles... " + "[" + languagesDownloading + "]";
			}
			else if (languagesFailed.length > 0) {
				status.textContent = "Could not load language profile(s): " + "[" + languagesFailed + "]";
			}
			else {
				status.textContent = "Language profiles loaded: " + "[" + languages + "]";
				if (loadedLangProfiles == null) {
					loadedLangProfiles = com.prezi.langdetect.LanguageProfiles.loadFromJsonStrings(jsonData);
					detectButton.disabled = false;
				}
			}
		}
		updateStatus();

		languages.forEach(function(l) {
			var baseUrl = 'profiles/'
			var request = new XMLHttpRequest();
			request.open('GET', 'profiles/' + l);
			request.onload = function() {
				jsonData.push(request.responseText);
				languagesDownloaded.push(l);
				updateStatus();
				console.log("Loaded", l, "with size", request.responseText.length);
			};
			request.onerror = function() {
				languagesFailed.push(l);
				updateStatus();
			};
			request.send();
		});
	}

	document.addEventListener('DOMContentLoaded', main);
}