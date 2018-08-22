const PERCENT = 100;

function gen() {
	let input = stdin.val();
	let wordLen = parseInt(wordLenSlider.val()) / PERCENT;
	let textLen = parseInt(textLenSlider.val());
	try {
		stderr.html('');
		stdout.text(genText(input, wordLen, textLen));
	} catch(e) {
		stdout.text('');
		stderr.html(e);
	}
}

function genText(program, wordLen, textLen) {
	let lines = program.split('\n');
	let sections = {};
	let lastSection = '';

	lines.forEach(line => {
		line = line.split(/(^|\s+)\/\/./)[0];
		if(line == '') return;
		if(/^# ?\w/.test(line)) {
			lastSection = line.match(/^#\s*(\w+)/)[1];
			if(lastSection.startsWith("restrict")) {
				lastSection = "disallowed";
			}
			lastSection = lastSection[0];
			sections[lastSection] = [];
			return;
		}
		if(!sections[lastSection])
			sections[lastSection] = [];
		sections[lastSection].push(line);
	});

	if(!sections.g) {
		throw "No <code># groups</code> section!";
	}

	let g = groups(sections.g);
	g = expandInclusions(g);

	if(sections.s && sections.w) {
		throw "<code># syllables</code> and <code># words</code> can't both be defined!";
	} else if(!sections.s && !sections.w) {
		throw "Either <code># syllables</code> or <code># words</code> must be defined!";
	}

	let word = sections.s ? syllables(sections.s) : `[${sections.w.join('/')}]`;

	let tree = parseWord(word, wordLen);

	if(!sections.f) sections.f = [];
	let features = handleFeatures(sections.f);

	if(!sections.r) sections.r = [];
	let replace = handleReplacements(sections.r, features, g);

	if(!sections.d) sections.d = [];
	let disallowed = handleDisallowed(sections.d, g);
	$A = disallowed;
	// $("#debug").text(disallowed+"")

	let sentences = poisson(textLen);
	let text = [];
	for(let i=0; i<sentences; i++) {
		let words = 2 + poisson(6);
		let sentence = [];
		for(let j=0; j<words; j++) {
			sentence.push(createWord(tree, g, disallowed));
		}
		sentence = sentence.map(w => {
			let fea = {};
			features.forEach(f => {
				fea[f] = Math.random() < 0.5;
			});
			return replace(w, fea);
		});
		if(Math.random() < 0.3) {
			let i = rand(sentence.length - 1);
			sentence[i] += ',';
		}
		sentence = sentence.join(' ') + sample('....?!');
		sentence = sentence[0].toUpperCase() + sentence.slice(1);
		text.push(sentence);
	}
	text = text.join(' ');
	return text;
}

function groups(lines) {
	let gs = {};
	lines.forEach((line, i) => {
		let m = line.match(/^([A-Z])\s*=\s*(.+)$/);
		if(!m) {
			throw `Syntax error in line ${i+1} of groups`;
		}
		m = m.slice(1);
		if(gs[m[0]]) {
			throw `Group ${m[0]} defined twice!`;
		}
		gs[m[0]] = ungroup(m[1]);
	});
	return gs;
}

function syllables(lines) {
	let currentBits = ['m'];
	let syls = {};
	lines.forEach(line => {
		if(line[0] == '-') {
			currentBits = line.split(' ').slice(1).map(x => x[0]);
			return;
		}
		currentBits.forEach(b => {
			if(!syls[b]) syls[b] = [];
			syls[b].push(line);
		});
	});
	for(let i in syls) {
		syls[i] = `[${syls[i].join('/')}]`;
	}
	let word = '';
	if(syls.i) {
		if(syls.f) {
			word = syls.m
				? `${syls.i}((&%${syls.m})*${syls.f})`
				: `${syls.i}(${syls.f})`;
		} else {
			word = syls.m
				? `${syls.i}(&%${syls.m})*`
				: syls.i;
		}
	} else {
		if(syls.f) {
			word = syls.m
				? `(&%${syls.m})*${syls.f}`
				: syls.f
		} else {
			if(syls.m) {
				word = `(&%${syls.m})+`
			} else {
				throw "Syllables must be defined!";
			}
		}
	}
	return word;
}

function parseWord(code, len) {
	let amps = Math.round(PERCENT / (code.match(/&/g) || []).length * len);
	let preprocess = (str, type='') => {
		let i = 0;
		let tmp;
		let o = '';
		let chance = PERCENT/2;
		let chanceSet = false;
		while(str[i] !== type[1] && i < str.length) {
			switch(str[i]) {
				case '[':
				case '(':
					tmp = preprocess(str.slice(i+1), str[i] === '[' ? '[]' : '()');
					i += tmp.i;
					o += tmp.o;
				break;
				case '%':
					if(type === '()' && !chanceSet) {
						chance = parseInt(o);
						chanceSet = true;
						o = '';
					} else {
						o += str[i];
					}
				break;
				case '/':
					if(type === '()') {
						throw '<code>/</code> inside parentheses?';
					} else {
						o += str[i] + '';
					}
				break;
				case '&':
					if(i == 0) {
						o += amps;
					} else {
						o += str[i];
					}
				break;
				case '+':
				case '*':
					l = str[i-1];
					if(l === ']' || l === ')') break;
					o = o.slice(0, -1);
					o += `${str[i] === '+' ? `${l}` : ''}(${PERCENT/2}%${l})*`
				break;
				default:
					o += str[i];
				break;
			}
			i++;
		}

		if(chance > PERCENT) {
			throw `Chance can't be greater than ${PERCENT}%!`;
		} else if(chance < 0) {
			throw "Chance can't be less than 0%!"
		}

		i++;
		let next = str[i];
		if(next === '+') {
			o = type === '()'
				? `${o}(${chance}%${o})`
				: `[${o}/](${chance}%[${o}/])`;
		} else if(next === '*') {
			o = type === '()'
				? `(${chance}%${o})`
				: `(${chance}%[${o}/])`;
		} else {
			o = type === '()'
				? `[${PERCENT-chance}%/${chance}%${o}/]`
				: `[${o}/]`;
		}

		return {i, o, type, next};
	}

	let recurse = (str) => {
		let repeat = str[0] === '(';
		let close = repeat ? ')' : ']';
		let i = 1;
		let o = {
			repeat,
			content: []
		};
		if(repeat) {
			o.chance = 50;
		} else {
			o.chances = [];
		}
		let chance = null;
		let group = [];
		let tmp;
		let chanceSet = false;

		while(str[i] !== close && i < str.length) {
			switch(str[i]) {
				case '(':
				case '[':
					tmp = recurse(str.slice(i));
					i += tmp.i;
					group.push(tmp);
				break;
				case '/':
					if(repeat) {
						throw '<code>/</code> inside parentheses?';
					} else {
						o.content.push(group);
						group = [];
						o.chances.push(chance);
						chance = null;
					}
					chanceSet = false;
				break;
				case '%':
					if(!group.every(x => typeof x === 'string' && /\d/.test(x))) {
						throw 'Non-number found inside percentage?';
					}
					if(chanceSet) {
						throw 'Chance set twice?';
					}
					chance = parseInt(group.join(''));
					if(repeat) o.chance = chance;
					group = [];
					chanceSet = true;
				break;
				default:
					group.push(str[i]);
				break;
			}
			i++;
		}
		o.i = i;
		if(repeat) {
			o.content = group;
			o.chance /= PERCENT
		} else {
			let total = 0;
			let nulls = 0;
			o.chances.forEach(c => {
				total += total ? total : 0;
				if(c === null) nulls++;
			});

			let perc = (PERCENT - total) / nulls;
			o.chances = o.chances.map(c => c === null ? perc : c);
			total = 0;
			o.chances = o.chances.map(c => {
				total += c;
				return total;
			});
			o.chances = o.chances.map(c => c / total);
		}
		return o;
	}

	let pp = preprocess(code).o;
	return recurse(pp.replace(/&/g, amps));
}

function createWord(tree, groups, disallowed) {
	let content = arr => {
		let o = '';
		arr.forEach(e => {
			if(typeof e === 'string') {
				o += groups[e] ? sample(groups[e]) : e;
			} else {
				o += recurse(e);
			}
		});
		return o;
	}

	let recurse = node => {
		let o = '';
		if(node.repeat) {
			while(Math.random() <= node.chance) {
				o += content(node.content);
			}
		} else {
			let prob = Math.random();
			let i = 0;
			while(node.chances[i] < prob) i++;
			o += content(node.content[i]);
		}
		return o;
	};

	let word;
	do {
		word = recurse(tree);
	} while(disallowed(word));
	return word;
}

function handleFeatures(lines) {
	if(lines.length === 0) return [];
	if(lines.length > 1) throw "All features must be on one line.";
	let line = lines[0];
	if(!/^\[.+\]$/.test(line)) throw "All features must be enclosed within brackets.";
	let features = line.slice(1, -1).split(/,\s*/);
	return features;
}

function handleReplacements(lines, ffs, groups) {
	let regexes = [];
	lines.forEach((line, i) => {
		let r = line.split(/\//g);
		if(r.length !== 4 || !/([\+\-]\w+(,\s*[\+\-]\w+)*)?/.test(r[3])) {
			throw `Syntax error in feature replacement on line ${i+1}!`;
		}
		r[1] = [...r[1]].map(x => groups[x] ? `(?:${groups[x].join('|')})` : x).join('');
		r[2] = r[2].replace(/\\(?=\d)/g, '$');
		let br = [];
		r.forEach(x => {
			let ma = x.match(/\{[^\}]+\}/g)
			if(!ma) return;
			let ungr = ma.map(m => ungroup(m.slice(1, -1)));
			br = br.concat(ungr);
		});
		let fea = [];
		if(r[3] !== '') {
			let features = r[3].split(/,\s*/);
			fea = features.map(f => {
				let [plus, name] = f.match(/^([\+\-])(.+)$/).slice(1);
				if(!ffs.includes(name)) throw `Feature <code>${name}</code> not defined!`;
				return [name, plus === '+'];
			});
		} else {
			fea = [];
		}
		if(br.length === 0) {
			regexes.push({regex: new RegExp(r[1], 'g'), replace: r[2], features: fea});
			return;
		}
		if(!br.every(x => x.length === br[0].length)) {
			throw `Unequal <code>{}</code> groups on line ${i+1}!`
		}
		br = transpose(br);
		br.forEach(b => {
			let t = r.map(x => x.replace(/\{[^\}]+\}/, () => b.shift()));
			regexes.push({regex: new RegExp(t[1], 'g'), replace: t[2], features: fea});
		});
	});

	let fn = function(word, features) {
		regexes.forEach(r => {
			if(r.features.every(f => features[f[0]] === f[1])) {
				let old = '';
				while(old !== word) {
					old = word;
					word = word.replace(r.regex, r.replace);
				}
			}
		});
		return word;
	}

	return fn;
}

function handleDisallowed(lines, groups) {
	let regexes = lines.map(line => {
		if(/^\/.+\/$/.test(line)) {
			line = line.slice(1, -1);
		} else {
			// stolen from stackoverflow
			line = line.replace(/[\/-\[\]\{\}\(\)\*\+\?\.\,\\\^\$\|\#\\\s]/g, '\\$&');
		}
		line = [...line].map(x => groups[x] ? `(?:${groups[x].join('|')})` : x).join('');
		return new RegExp(line);
	});
	let fn = function(text) {
		return regexes.some(r => r.test(text));
	};
	return fn;
}

function ungroup(text) {
	let words = text.split(' ');
	let chars = [...words[0]].map(x => x === '0' ? '' : x);
	if(words[0] == '!') chars = [];
	return chars.concat(words.slice(1));
}

function expandInclusions(groups) {
	let expand = (g, tries=[]) => {
		let o = [];
		groups[g].forEach(seg => {
			if(/^\$./.test(seg)) {
				let incl = seg.substr(1);
				if(tries.includes(incl)) {
					throw "Infinite loop detected!"
				}
				o = o.concat(expand(incl, tries.concat(incl)));
			} else {
				o.push(seg);
			}
		});
		return o;
	};

	let out = {};
	for(let k in groups) {
		out[k] = expand(k);
	}
	return out;
}

function sample(arr) {
	return arr[rand(arr.length)];
}

function rand(n) {
	return Math.floor(Math.random() * n);
}

// taken off wikipedia
function poisson(n) {
	let l = Math.pow(Math.E, -n);
	let k = 0;
	let p = 1;
	while(p > l) {
		k++;
		p *= Math.random();
	}
	return k - 1;
}

function transpose(arr) {
	return arr[0].map((_, i) => {
		return arr.map(x => x[i]);
	})
}

$(document).ready(function() {
	stdin = $('#input');
	stdout = $('#output');
	stderr = $('#error');
	wordLenSlider = $('#wordLen');
	textLenSlider = $('#textLen');

	$('#go').click(gen);
	// stdin.keydown(e => {
	// 	if(e.keyCode == 13 && e.ctrlKey) {
	// 		gen();
	// 	}
	// });

	gen();
});