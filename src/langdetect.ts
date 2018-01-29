/// <reference path="cjk_map.ts" />

module com.prezi.langdetect {
	var ALPHA_DEFAULT = 0.5;
	var ALPHA_WIDTH = 0.05;

	var ITERATION_LIMIT = 1000;
	var PROB_THRESHOLD = 0.1;
	var CONV_THRESHOLD = 0.99999;
	var BASE_FREQ = 10000;
	var N_TRIAL = 7;

	var URL_REGEX = new RegExp("https?://[-_.?&~;+=/#0-9A-Za-z]{1,2076}", 'g');
	var MAIL_REGEX = new RegExp("[-_.0-9A-Za-z]{1,64}@[-_0-9A-Za-z]{1,255}[-_.0-9A-Za-z]{1,255}", 'g');

	export class Detector {

		private alpha = ALPHA_DEFAULT;
		private max_text_length = 10000;
		private priorMap:number[] = null;

		private text = "";
		private profiles:LanguageProfiles;

		constructor(profiles:LanguageProfiles) {
			this.profiles = profiles;
		}

		appendString(str:string) {
			str = str.replace(URL_REGEX, " ");
			str = str.replace(MAIL_REGEX, " ");
			// TODO: vietnamese normalization
			// str = NGram.normalize_vi(str);
			var pre = '\0';
			for (var i = 0; i < str.length && i < this.max_text_length; ++i) {
				var c = str.charAt(i);
				if (c != ' ' || pre != ' ') {
					this.text += c;
				}
				pre = c;
			}
		}

		private cleaningText() {
			var latinCount = 0;
			var nonLatinCount = 0;
			for (var i = 0; i < this.text.length; ++i) {
				var c = this.text.charAt(i);
				if (c <= 'z' && c >= 'A') {
					++latinCount;
				} else if (c >= '\u0300' && getUnicodeBlock(c) != UnicodeBlock.LATIN_EXTENDED_ADDITIONAL) {
					++nonLatinCount;
				}
			}
			if (latinCount * 2 < nonLatinCount) {
				var textWithoutLatin = "";
				for (var i = 0; i < this.text.length; ++i) {
					var c = this.text.charAt(i);
					if (c > 'z' || c < 'A') {
						textWithoutLatin += c;
					}
				}
				this.text = textWithoutLatin;
			}
		}

		detect():string {
			var probabilities = this.getProbabilities();
			if (probabilities.length > 0) {
				return probabilities[0].lang;
			}
			return "unknown";
		}

		getProbabilities() {
			var probabilities = this.detectBlock();
			return this.sortProbability(probabilities);
		}

		private sortProbability(prob:number[]):LangProbability[] {
			var list:LangProbability[] = [];
			for (var j=0; j < prob.length; ++j) {
				var p = prob[j];
				if (p > PROB_THRESHOLD) {
					for (var i = 0; i <= list.length; ++i) {
						if (i == list.length || list[i].prob < p) {
							var l = new LangProbability(this.profiles.langList[j], p);
							list.splice(i, 0, l);
							break;
						}
					}
				}
			}
			return list;
		}

		private detectBlock():number[] {
			this.cleaningText();
			var ngrams:string[] = this.extractNGrams(this.text);
			if (ngrams.length == 0) {
				throw new Error("no features in text");
			}
			var langProb = zeroedArray(this.profiles.langList.length);

			var rand = new Random();
			for (var t = 0; t < N_TRIAL; ++t) {
				var prob = this.initProbability();
				var alpha = this.alpha + rand.nextGaussian() * ALPHA_WIDTH;
				for (var i = 0;; ++i) {
					var r = rand.nextInt(ngrams.length);
					this.updateLangProb(prob, ngrams[r], alpha);
					if (i % 5 == 0) {
						if (Detector.normalizeProb(prob) > CONV_THRESHOLD || i >= ITERATION_LIMIT) {
							break;
						}
					}
				}
				for (var j=0; j < langProb.length; ++j) {
					langProb[j] += prob[j] / N_TRIAL;
				}
			}

			return langProb;
		}

		private initProbability():number[] {
			var len = this.profiles.langList.length;
			var prob = zeroedArray(len);
			if (this.priorMap != null) {
				for(var i = 0; i < len; ++i) {
					prob[i] = this.priorMap[i];
				}
			} else {
				for(var i = 0; i < len; ++i) {
					prob[i] = 1.0 / len;
				}
			}
			return prob;
		}

		private extractNGrams(text:string):string[] {
			var list:string[] = [];
			var ngram = new NGram();
			for (var i = 0; i < text.length; ++i) {
				ngram.addChar(text.charAt(i));
				for (var n = 1; n <= NGram.N_GRAM; ++n) {
					var w = ngram.get(n);
					if (w != null && w in this.profiles.wordLangProbMap) {
						list.push(w);
					}
				}
			}
			return list;
		}

		private updateLangProb(prob:number[], word:string, alpha:number):boolean {
			if (word == null || !(word in this.profiles.wordLangProbMap)) {
				return false;
			}

			var langProbMap = this.profiles.wordLangProbMap[word];

			var weight = alpha / BASE_FREQ;
			for (var i = 0; i < prob.length; ++i) {
				prob[i] *= weight + langProbMap[i];
			}
			return true;
		}

		private static normalizeProb(prob:number[]):number {
			var maxp = 0, sump = 0;
			for (var i = 0; i < prob.length; ++i) {
				sump += prob[i];
			}
			for (var i = 0; i < prob.length; ++i) {
				var p = prob[i] / sump;
				if (maxp < p) {
					maxp = p;
				}
				prob[i] = p;
			}
			return maxp;
		}
	}

	export class LangProbability {
		constructor(public lang:string, public prob:number) {
		}

		public toString() {
			return '<' + this.lang + ': ' + this.prob + '>';
		}
	}

	export class LanguageProfiles {
		langList:string[] = [];
		wordLangProbMap:{ [word:string]: number[] } = {};

		public static loadFromJsonStrings(jsons:string[]) {
			var langProfiles = new LanguageProfiles();
			jsons.forEach((json: string, index: number) => {
				langProfiles.addJsonProfile(json, index, jsons.length);
			});
			return langProfiles;
		}

		addJsonProfile(jsonString:string, index:number, numProfiles:number) {
			var profile = JSON.parse(jsonString);
			var lang = profile.name;
			if (this.langList.indexOf(lang) >= 0) {
				throw new Error("duplicate the same language profile");
			}
			this.langList.push(lang);
			for (var word in profile.freq) {
				if (!(word in this.wordLangProbMap)) {
					this.wordLangProbMap[word] = zeroedArray(numProfiles);
				}
				var length = word.length;
				if (length >= 1 && length <= 3) {
					var prob = profile.freq[word] / profile.n_words[length - 1];
					this.wordLangProbMap[word][index] = prob;
				}
			}
		}
	}

	class NGram {
		static N_GRAM = 3;
		static LATIN1_EXCLUDED = "\u00A0\u00AB\u00B0\u00BB";

		private grams_ = ' ';
		private capitalword_ = false;

		public addChar(ch:string) {
			ch = NGram.normalize(ch);
			var lastchar = this.grams_.charAt(this.grams_.length - 1);
			if (lastchar == ' ') {
				this.grams_ = ' ';
				this.capitalword_ = false;
				if (ch == ' ') {
					return;
				}
			} else if (this.grams_.length >= NGram.N_GRAM) {
				this.grams_ = this.grams_.substr(1);
			}
			this.grams_ += ch;

			if (isUpperCase(ch)) {
				if (isUpperCase(lastchar)) {
					this.capitalword_ = true;
				}
			} else {
				this.capitalword_ = false;
			}
		}

		public get(n:number):string {
			if (this.capitalword_) {
				return null;
			}
			var len = this.grams_.length;
			if (n < 1 || n > 3 || len < n) {
				return null;
			}
			if (n == 1) {
				var ch = this.grams_.charAt(len - 1);
				if (ch == ' ') {
					return null;
				}
				return ch;
			} else {
				return this.grams_.substring(len - n, len);
			}
		}

		static normalize(ch:string):string {
			var cjk_map = com.prezi.langdetect.CJK_MAP;
			var block = getUnicodeBlock(ch);
			if (block == UnicodeBlock.BASIC_LATIN) {
				if (ch < 'A' || (ch < 'a' && ch > 'Z') || ch > 'z') ch = ' ';
			} else if (block == UnicodeBlock.LATIN_1_SUPPLEMENT) {
				if (NGram.LATIN1_EXCLUDED.indexOf(ch) >= 0) ch = ' ';
			} else if (block == UnicodeBlock.LATIN_EXTENDED_B) {
				// normalization for Romanian
				if (ch == '\u0219') ch = '\u015f';  // Small S with comma below => with cedilla
				if (ch == '\u021b') ch = '\u0163';  // Small T with comma below => with cedilla
			} else if (block == UnicodeBlock.GENERAL_PUNCTUATION) {
				ch = ' ';
			} else if (block == UnicodeBlock.ARABIC) {
				if (ch == '\u06cc') ch = '\u064a';  // Farsi yeh => Arabic yeh
			} else if (block == UnicodeBlock.LATIN_EXTENDED_ADDITIONAL) {
				if (ch >= '\u1ea0') ch = '\u1ec3';
			} else if (block == UnicodeBlock.HIRAGANA) {
				ch = '\u3042';
			} else if (block == UnicodeBlock.KATAKANA) {
				ch = '\u30a2';
			} else if (block == UnicodeBlock.BOPOMOFO || block == UnicodeBlock.BOPOMOFO_EXTENDED) {
				ch = '\u3105';
			} else if (block == UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS) {
				if (ch in cjk_map) ch = cjk_map[ch];
			} else if (block == UnicodeBlock.HANGUL_SYLLABLES) {
				ch = '\uac00';
			}
			return ch;
		}

	}

	enum UnicodeBlock {
		BASIC_LATIN,
		LATIN_1_SUPPLEMENT,
		LATIN_EXTENDED_B,
		ARABIC,
		LATIN_EXTENDED_ADDITIONAL,
		GENERAL_PUNCTUATION,
		HIRAGANA,
		KATAKANA,
		BOPOMOFO,
		BOPOMOFO_EXTENDED,
		CJK_UNIFIED_IDEOGRAPHS,
		HANGUL_SYLLABLES,
	}

	function getUnicodeBlock(c:string) {
		if (c.length != 1) {
			throw Error("Cannot get unicode block for multiple characters");
		}
		var code = c.charCodeAt(0);
		if (0x0000 <= code && code <= 0x007F) return UnicodeBlock.BASIC_LATIN;
		if (0x0080 <= code && code <= 0x00FF) return UnicodeBlock.LATIN_1_SUPPLEMENT;
		if (0x0180 <= code && code <= 0x024F) return UnicodeBlock.LATIN_EXTENDED_B;
		if (0x0600 <= code && code <= 0x06FF) return UnicodeBlock.ARABIC;
		if (0x1E00 <= code && code <= 0x1EFF) return UnicodeBlock.LATIN_EXTENDED_ADDITIONAL;
		if (0x2000 <= code && code <= 0x206F) return UnicodeBlock.GENERAL_PUNCTUATION;
		if (0x3040 <= code && code <= 0x309F) return UnicodeBlock.HIRAGANA;
		if (0x30A0 <= code && code <= 0x30FF) return UnicodeBlock.KATAKANA;
		if (0x3100 <= code && code <= 0x312F) return UnicodeBlock.BOPOMOFO;
		if (0x31A0 <= code && code <= 0x31BF) return UnicodeBlock.BOPOMOFO_EXTENDED;
		if (0x4E00 <= code && code <= 0x9FFF) return UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS;
		if (0xAC00 <= code && code <= 0xD7AF) return UnicodeBlock.HANGUL_SYLLABLES;
		return -1;
	}

	function isUpperCase(c:string) {
		if (c.toLowerCase() != c) {
			return true;
		}
		return false;
	}

	function zeroedArray(len:number):number[] {
		var array = new Array(len);
		for (var i = 0; i < len; i++) {
			array[i] = 0;
		}
		return array;
	}

	class Random {
		private nextNextGaussian = 0;
		private haveNextNextGaussian = false;

		public nextGaussian():number {
			if (this.haveNextNextGaussian) {
				this.haveNextNextGaussian = false;
				return this.nextNextGaussian;
			} else {
				var v1:number, v2:number, s:number;
				do {
					v1 = 2 * this.nextDouble() - 1;   // between -1.0 and 1.0
					v2 = 2 * this.nextDouble() - 1;   // between -1.0 and 1.0
					s = v1 * v1 + v2 * v2;
				} while (s >= 1 || s == 0);
				var multiplier = Math.sqrt(-2 * Math.log(s)/s);
				this.nextNextGaussian = v2 * multiplier;
				this.haveNextNextGaussian = true;
				return v1 * multiplier;
			}
		}

		public nextDouble():number {
			return Math.random();
		}

		public nextInt(max:number):number {
			return Math.floor(Math.random() * max);
		}
	}
}
