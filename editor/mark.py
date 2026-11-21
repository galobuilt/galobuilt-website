"""Adds data-k="<page>-<n>" to every plain text element inside <main>, so the editor can find and change it.
Run once after hand edits to the pages: python3 editor/mark.py. Elements that already have data-k keep their key."""
import re, os, glob
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
TAGS = 'h1|h2|h3|p|li|dd|b|span'
for f in ['index.html', 'about.html', 'services.html', 'projects.html', 'contact.html']:
    s = open(f).read()
    page = f[:-5]
    a, b = s.index('<main'), s.index('</main>')
    main = s[a:b]
    used = [int(x) for x in re.findall(r'data-k="' + page + r'-(\d+)"', s)]
    n = max(used, default=0)
    def add(m):
        global n
        tag, attrs, inner = m.group(1), m.group(2), m.group(3)
        if 'data-k=' in attrs or 'class="hp"' in attrs: return m.group(0)
        if not inner.strip() or '<' in inner or len(inner.strip()) < 2: return m.group(0)
        # Form choices (a span right after its input) stay fixed: the email reports the input's value.
        if re.search(r'<input[^>]*>\s*$', m.string[:m.start()]): return m.group(0)
        if re.search(r'class="[^"]*(num|tag lb|lb__|form-note|opt)', attrs) or 'data-first' in attrs or 'data-form-status' in attrs: return m.group(0)
        n += 1
        return f'<{tag}{attrs} data-k="{page}-{n}">{inner}</{tag}>'
    prev = None
    while prev != main:
        prev = main
        main = re.sub(r'<(' + TAGS + r')((?:\s[^<>]*)?)>([^<]*)</\1>', add, main)
    s = s[:a] + main + s[b:]
    open(f, 'w').write(s)
    print(f, n)
