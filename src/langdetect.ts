import { CJK_MAP } from "./cjk_map";

const ALPHA_DEFAULT = 0.5;
const ALPHA_WIDTH = 0.05;

const ITERATION_LIMIT = 1000;
const PROB_THRESHOLD = 0.1;
const CONV_THRESHOLD = 0.99999;
const BASE_FREQ = 10000;
const N_TRIAL = 7;

const URL_REGEX = new RegExp("https?://[-_.?&~;+=/#0-9A-Za-z]{1,2076}", 'g');
const MAIL_REGEX = new RegExp("[-_.0-9A-Za-z]{1,64}@[-_0-9A-Za-z]{1,255}[-_.0-9A-Za-z]{1,255}", 'g');

class DetectorImpl implements Detector {

	private alpha = ALPHA_DEFAULT;
	private max_text_length = 10000;
	private priorMap: Array<number> | null = null;

	private text = "";
	private profiles: LanguageProfiles;

	constructor(profiles: LanguageProfiles) {
		this.profiles = profiles;
	}

	appendString(str:string) {
		str = str.replace(URL_REGEX, " ");
		str = str.replace(MAIL_REGEX, " ");
		str = NGram.normalize_vi(str);
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
						var l = new LangProbabilityImpl(this.profiles.langList[j], p);
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
					if (normalizeProb(prob) > CONV_THRESHOLD || i >= ITERATION_LIMIT) {
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

}

function normalizeProb(prob:number[]):number {
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

class LangProbabilityImpl implements LangProbability {
	constructor(public lang:string, public prob:number) {
	}

	public toString() {
		return '<' + this.lang + ': ' + this.prob + '>';
	}
}

class LanguageProfiles {
	langList:string[] = [];
	wordLangProbMap:{ [word:string]: number[] } = {};

	addJsonProfile(jsonString:string, index:number, numProfiles:number) {
		const profile: Profile = parseProfile(jsonString);
		const lang = profile.name;
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
	static VI_NORMALIZED: string[] = ['\u00C0\u00C8\u00CC\u00D2\u00D9\u1EF2\u00E0\u00E8\u00EC\u00F2\u00F9\u1EF3\u1EA6\u1EC0\u1ED2\u1EA7\u1EC1\u1ED3\u1EB0\u1EB1\u1EDC\u1EDD\u1EEA\u1EEB', '\u00C1\u00C9\u00CD\u00D3\u00DA\u00DD\u00E1\u00E9\u00ED\u00F3\u00FA\u00FD\u1EA4\u1EBE\u1ED0\u1EA5\u1EBF\u1ED1\u1EAE\u1EAF\u1EDA\u1EDB\u1EE8\u1EE9', '\u00C3\u1EBC\u0128\u00D5\u0168\u1EF8\u00E3\u1EBD\u0129\u00F5\u0169\u1EF9\u1EAA\u1EC4\u1ED6\u1EAB\u1EC5\u1ED7\u1EB4\u1EB5\u1EE0\u1EE1\u1EEE\u1EEF', '\u1EA2\u1EBA\u1EC8\u1ECE\u1EE6\u1EF6\u1EA3\u1EBB\u1EC9\u1ECF\u1EE7\u1EF7\u1EA8\u1EC2\u1ED4\u1EA9\u1EC3\u1ED5\u1EB2\u1EB3\u1EDE\u1EDF\u1EEC\u1EED', '\u1EA0\u1EB8\u1ECA\u1ECC\u1EE4\u1EF4\u1EA1\u1EB9\u1ECB\u1ECD\u1EE5\u1EF5\u1EAC\u1EC6\u1ED8\u1EAD\u1EC7\u1ED9\u1EB6\u1EB7\u1EE2\u1EE3\u1EF0\u1EF1'];
	static VI_ALPHABET: string = 'AEIOUYaeiouy\u00c2\u00ca\u00d4\u00e2\u00ea\u00f4\u0102\u0103\u01a0\u01a1\u01af\u01b0';
	static VI_DIACRITICAL_MARK: string = '\u0300\u0301\u0303\u0309\u0323';

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

	public get(n: number): string | null {
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
			if (ch in CJK_MAP) ch = CJK_MAP[ch];
		} else if (block == UnicodeBlock.HANGUL_SYLLABLES) {
			ch = '\uac00';
		}
		return ch;
	}

	static normalize_vi(ch:string): string {
		var r: string = '';

		var e: RegExp = new RegExp('([' + NGram.VI_ALPHABET + '])([' + NGram.VI_DIACRITICAL_MARK + '])', 'g');
		var m: RegExpExecArray | null;

		while((m = e.exec(ch)) != null) {
			r += ch.substr(0, m.index) + NGram.VI_NORMALIZED[NGram.VI_DIACRITICAL_MARK.indexOf(m[2])].charAt(NGram.VI_ALPHABET.indexOf(m[1]));
			ch = ch.substr(e.lastIndex);
		}

		r += ch;

		return r;
	}
}

const enum UnicodeBlock {
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

function loadFromJsonStrings(jsons: Array<string>) {
	var langProfiles = new LanguageProfiles();
	jsons.forEach((json: string, index: number) => {
		langProfiles.addJsonProfile(json, index, jsons.length);
	});
	return langProfiles;
}

function parseProfile(data: string): Profile {
	const json = JSON.parse(data);
	return {
		name: json['name'],
		freq: json['freq'],
		n_words: json['n_words'],
	}
}

interface Profile {
	name: string,
	freq: { [word: string]: number },
	n_words: Array<number>
}

export interface LangProbability {
	lang: string;
	prob: number;
}

export interface Detector {
	appendString(text: string): void;
	detect(): string;
	getProbabilities(): Array<LangProbability>;
}

export function createDetector(profiles: Array<string>): Detector {
	return new DetectorImpl(loadFromJsonStrings(profiles));
}