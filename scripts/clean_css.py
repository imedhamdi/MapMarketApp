import re, pathlib, glob
from html.parser import HTMLParser

CSS_PATH = pathlib.Path('public/styles.css')
HTML_PATH = pathlib.Path('public/index.html')
JS_GLOB = 'public/js/*.js'
OUTPUT_PATH = pathlib.Path('public/styles.clean.css')

css_text = CSS_PATH.read_text()
css_no_comments = re.sub(r'/\*.*?\*/', '', css_text, flags=re.S)

# extract css tokens and keyframe names

def extract_css_tokens(css):
    tokens = set()
    selectors = re.findall(r'([^{}]+){', css)
    for selector in selectors:
        if selector.strip().startswith('@'):
            continue
        for part in selector.split(','):
            base = re.split(r':', part.strip())[0]
            subs = re.split(r'[\s>+~]+', base)
            for sp in subs:
                if not sp:
                    continue
                tokens.update(re.findall(r'\.[a-zA-Z0-9_-]+', sp))
                tokens.update(re.findall(r'#[a-zA-Z0-9_-]+', sp))
                tokens.update(re.findall(r'\[[^\]]+\]', sp))
                m = re.match(r'[a-zA-Z][a-zA-Z0-9_-]*', sp)
                if m:
                    tokens.add(m.group(0))
    return tokens

css_tokens = extract_css_tokens(css_no_comments)
keyframe_names = re.findall(r'@keyframes\s+([a-zA-Z0-9_-]+)', css_no_comments)

# HTML tokens
html_text = HTML_PATH.read_text()
class Parser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tokens = set()
    def handle_starttag(self, tag, attrs):
        self.tokens.add(tag)
        for (attr, val) in attrs:
            if attr == 'class':
                for c in val.split():
                    self.tokens.add('.'+c)
            elif attr == 'id':
                self.tokens.add('#'+val)
            self.tokens.add('['+attr+']')

p = Parser()
p.feed(html_text)
html_tokens = p.tokens

# JS tokens from quoted strings
js_tokens = set()
for path in glob.glob(JS_GLOB):
    text = pathlib.Path(path).read_text()
    for match in re.findall(r'(["\'])((?:\\.|[^\1])*?)\1', text):
        string = match[1]
        if not string.strip():
            continue
        for item in re.split(r'\s+', string):
            if item:
                js_tokens.add(item)

# Determine used tokens
used_tokens = set()
for token in css_tokens:
    name = token
    if token.startswith('.') or token.startswith('#'):
        name = token[1:]
    elif token.startswith('['):
        name = token[1:].split('=')[0].rstrip(']')
    if token in html_tokens or name in js_tokens or token in js_tokens:
        used_tokens.add(token)

basic_tags = {'body','h1','h2','h3','h4','h5','h6','p','a','img','button','ul','li','input','label','select','option','textarea','div','span','svg','path','html'}
for t in basic_tags:
    if t in css_tokens:
        used_tokens.add(t)
if ':root' in css_tokens:
    used_tokens.add(':root')

for token in css_tokens:
    if any(token.startswith(prefix) or token.lstrip('.#').startswith(prefix) for prefix in ['leaflet','marker','fa-']):
        used_tokens.add(token)

# keyframes used?
used_keyframes = set()

def selector_tokens(selector):
    result = set()
    for part in selector.split(','):
        base = re.split(r':', part.strip())[0]
        subs = re.split(r'[\s>+~]+', base)
        for sp in subs:
            if not sp:
                continue
            result.update(re.findall(r'\.[a-zA-Z0-9_-]+', sp))
            result.update(re.findall(r'#[a-zA-Z0-9_-]+', sp))
            result.update(re.findall(r'\[[^\]]+\]', sp))
            m = re.match(r'[a-zA-Z][a-zA-Z0-9_-]*', sp)
            if m:
                result.add(m.group(0))
    return result

# Parse rules and keep used ones

def parse_rules(text, outer_selector=None):
    rules = []
    i = 0
    n = len(text)
    while True:
        j = text.find('{', i)
        if j == -1:
            break
        selector = text[i:j].strip()
        depth = 1
        k = j + 1
        while k < n and depth > 0:
            if text[k] == '{':
                depth += 1
            elif text[k] == '}':
                depth -= 1
            k += 1
        block = text[j:k]
        full = text[i:k]
        rules.append((selector, block, full))
        i = k
    return rules

css_clean = []
removed_selectors = []

# function to process a block (e.g., full css)

pos = 0
rules = parse_rules(css_no_comments)
for selector, block, full in rules:
    if selector.startswith(':root'):
        css_clean.append(full + "\n")
        continue
    if selector.startswith('@media'):
        inner = block[block.find('{')+1:-1]
        inner_rules = parse_rules(inner)
        kept = []
        for sel2, block2, full2 in inner_rules:
            if selector_tokens(sel2) & used_tokens:
                kept.append(full2)
        if kept:
            css_clean.append(f"{selector}{{" + ''.join(kept) + "}\n")
            for sel2, block2, full2 in inner_rules:
                if not selector_tokens(sel2) & used_tokens:
                    removed_selectors.append(sel2.strip())
        else:
            removed_selectors.append(selector.strip())
    elif selector.startswith('@keyframes'):
        name_match = re.match(r'@keyframes\s+([a-zA-Z0-9_-]+)', selector)
        if name_match and name_match.group(1) in js_tokens or name_match.group(1) in html_tokens or name_match.group(1) in used_tokens:
            css_clean.append(full + "\n")
            used_keyframes.add(name_match.group(1))
        else:
            removed_selectors.append(selector.strip())
    else:
        if selector_tokens(selector) & used_tokens:
            css_clean.append(full + "\n")
        else:
            removed_selectors.append(selector.strip())

# finalize
report = ["\n/*", "--- RAPPORT DE NETTOYAGE CSS ---", "Les sélecteurs suivants ont été identifiés comme inutilisés et ont été supprimés :"]
for sel in removed_selectors:
    sel = sel.replace('\n', ' ').strip()
    if sel:
        report.append(f"- {sel}")
report.append("--------------------------------")
report.append("*/\n")

OUTPUT_PATH.write_text(''.join(css_clean) + '\n'.join(report))
print('clean css written to', OUTPUT_PATH)
