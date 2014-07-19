var checker = new Typo('en_US', null, null, {
	platform: 'web',
	dictionaryPath: 'dictionaries',
});

var $ = function(x) { return document.getElementById(x); };

function updateUI(disable, correct, suggestions) {
	if (disable) {
		$('correct').parentNode.style.display = "none";
		$('suggest').style.display = "none";
	}
	else if (correct) {
		$('correct').parentNode.style.display = "";
		$('correct').textContent = "Yes";
		$('suggest').style.display = "none";
	}
	else {
		$('correct').parentNode.style.display = "";
		$('correct').textContent = "No";
		$('suggest').style.display = "";
		$('suggest_list').innerHTML = "";
		suggestions.forEach(function(x) {
			var item = document.createElement('li');
			item.textContent = x;
			$('suggest_list').appendChild(item);
		});
	}
}

updateUI(true);

var language_list = ['en_US', 'de_DE', 'es_ES', 'fr_FR', 'hu_HU', 'nl_NL'];
language_list.forEach(function(x) {
	var o = new Option(x, x);
	$('lang_select').add(o);
});

$('lang_select').addEventListener('change', function(e) {
		var v = e.target.value;
		console.log("Language:", v);
		checker = new Typo(v, null, null, {
			platform: 'web',
			dictionaryPath: 'dictionaries',
		});
		checkWord();
	});

$('input').value = '';
$('input').addEventListener('input', function(e) {
		checkWord();
	});

function checkWord() {
	var v = $('input').value;
	console.log(v);
	if (v) {
		updateUI(false, checker.check(v), checker.suggest(v, 15));
	}
	else {
		updateUI(true);
	}
};

