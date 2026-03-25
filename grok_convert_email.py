import os
import re
import uuid
from bs4 import BeautifulSoup

def parse_style(style_str):
    res = {}
    if not style_str:
        return res
    for item in style_str.split(';'):
        if ':' in item:
            key, val = item.split(':', 1)
            res[key.strip().lower()] = val.strip()
    return res

def get_rect(el):
    style = parse_style(el.get('style', ''))
    try:
        top = int(re.search(r'\d+', style.get('top', '0')).group() or 0)
        left = int(re.search(r'\d+', style.get('left', '0')).group() or 0)
        width = int(re.search(r'\d+', style.get('width', '0')).group() or 0)
        height = int(re.search(r'\d+', style.get('height', '0')).group() or 0)
    except:
        top = left = width = height = 0
    return {'top': top, 'left': left, 'width': width, 'height': height,
            'right': left + width, 'bottom': top + height}

def is_overlapping(r1, r2):
    return not (r1['right'] <= r2['left'] or r1['left'] >= r2['right'] or
                r1['bottom'] <= r2['top'] or r1['top'] >= r2['bottom'])

def elements_close_vertically(r1, r2, threshold=12):
    return abs(r1['top'] - r2['top']) <= threshold

# ====================== DYNAMIC CLASS NAME GENERATOR ======================
def generate_class_name(el, index):
    rect = el['rect']
    text = el.get('text', '').strip().lower()
    has_img = el['has_img']

    if has_img:
        if rect['width'] > 80 and rect['height'] > 80 and rect['top'] > 550:
            return "decorative-graphic"
        if rect['width'] < 50 and rect['height'] < 50:
            return f"icon-{index}"
        return f"image-{index}"

    # Text-based intelligent naming
    if any(word in text for word in ["hello", "hi ", "dear"]):
        return "greeting"
    if "detailed look" in text or "claim application" in text:
        return "main-heading"
    if "questions or concerns" in text:
        return "pill-questions"
    if "further attention" in text or "ombudsman" in text:
        return "pill-further"
    if "grievance cell" in text:
        return "grievance-cell"
    if "warm regards" in text or "claims experience team" in text:
        return "signature"
    if rect['top'] > 700 and len(text) > 100:   # long legal text at bottom
        return "footer-legal"
    if len(text) < 60 and rect['top'] < 150:
        return "header-text"

    return f"content-block-{index}"

# ====================== MAIN CONVERT FUNCTION (DYNAMIC) ======================
def convert(input_path, output_path):
    with open(input_path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f, 'html.parser')

    # Find main container
    container = soup.find('div', style=lambda s: s and 'position:relative' in s.replace(' ', ''))
    if not container:
        print("❌ No relative positioned container found.")
        return

    container_style = parse_style(container.get('style', ''))
    container_width = int(re.search(r'\d+', container_style.get('width', '595')).group() or 595)
    container_bg = container_style.get('background-color', '#ffffff')

    # Extract all elements
    raw_elements = []
    for table in container.find_all('table', recursive=False):
        rect = get_rect(table)
        td = table.find('td')
        text_content = td.get_text(strip=True) if td else ''
        has_img = bool(table.find('img'))
        bg_color = parse_style(table.get('style', '')).get('background-color') or \
                   (parse_style(td.get('style', '')) if td else {}).get('background-color')

        raw_elements.append({
            'rect': rect,
            'soup': table,
            'text': text_content,
            'has_img': has_img,
            'bg_color': bg_color,
            'is_spacer': bool(bg_color) and not has_img and not text_content
        })

    # 1. Merge background spacers into nearby elements (Pill creation)
    elements = []
    used = set()
    for el in raw_elements:
        if id(el) in used: continue
        if el['is_spacer']:
            for other in raw_elements:
                if id(other) == id(el) or id(other) in used: continue
                if is_overlapping(el['rect'], other['rect']) and (other['text'] or other['has_img']):
                    other['bg_color'] = el['bg_color']
                    used.add(id(el))
                    break
        if id(el) not in used:
            elements.append(el)

    # 2. Smart Text Block Merging
    i = 0
    while i < len(elements):
        if elements[i]['text'] and not elements[i]['has_img']:
            j = i + 1
            while j < len(elements):
                if (elements[j]['text'] and not elements[j]['has_img'] and
                    elements_close_vertically(elements[i]['rect'], elements[j]['rect'], 10) and
                    abs(elements[i]['rect']['left'] - elements[j]['rect']['left']) <= 25):
                    
                    # Merge content into first element
                    td_i = elements[i]['soup'].find('td')
                    td_j = elements[j]['soup'].find('td')
                    if td_j:
                        for child in td_j.contents:
                            td_i.append(child)
                    
                    elements[i]['text'] += " " + elements[j]['text']
                    elements[i]['rect']['bottom'] = max(elements[i]['rect']['bottom'], elements[j]['rect']['bottom'])
                    elements[i]['rect']['height'] = elements[i]['rect']['bottom'] - elements[i]['rect']['top']
                    used.add(id(elements[j]))
                    j += 1
                else:
                    break
            i = j
        else:
            i += 1

    elements = [el for el in elements if id(el) not in used]

    # Assign dynamic class names
    for idx, el in enumerate(elements):
        el['class_name'] = generate_class_name(el, idx)

    # 3. Group into vertical sections
    elements.sort(key=lambda x: x['rect']['top'])
    sections = []
    if elements:
        current = [elements[0]]
        for el in elements[1:]:
            if el['rect']['top'] - current[-1]['rect']['top'] > 50:   # New section
                sections.append(current)
                current = [el]
            else:
                current.append(el)
        sections.append(current)

    # 4. Build CSS & HTML
    css_rules = [
        f".container-main {{ width: 100%; max-width: {container_width}px; margin: 0 auto; background-color: {container_bg}; border-collapse: collapse; }}",
        "body { margin:0; padding:0; background:#f7f9fc; font-family: Arial, Helvetica, sans-serif; color:#22386f; line-height:1.5; }",
        "img { display:block; border:0; outline:none; max-width:100%; height:auto; }",
        ".pill { border-radius: 20px !important; }",
        "@media only screen and (max-width: 600px) {"
        "  .mobile-stack, .mobile-stack table { display: block !important; width: 100% !important; }"
        "  .decorative-graphic { margin-top: 20px !important; float: none !important; }"
        "}"
    ]

    html_rows = []
    prev_bottom = 0

    for section in sections:
        sec_top = min(e['rect']['top'] for e in section)
        v_gap = sec_top - prev_bottom
        if v_gap > 8:
            html_rows.append(f'<tr><td height="{v_gap}" style="font-size:1px; line-height:1px;">&nbsp;</td></tr>')

        sec_html = '<tr><td align="left" valign="top">\n  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">\n'

        # Group into horizontal rows
        section.sort(key=lambda x: x['rect']['top'])
        rows = []
        for el in section:
            placed = False
            for r in rows:
                if any(elements_close_vertically(el['rect'], m['rect'], 14) for m in r):
                    r.append(el)
                    placed = True
                    break
            if not placed:
                rows.append([el])

        for row in rows:
            row.sort(key=lambda x: x['rect']['left'])
            sec_html += '    <tr><td style="font-size:0;">\n'

            prev_right = 0
            for el in row:
                h_gap = el['rect']['left'] - prev_right
                if h_gap > 10:
                    sec_html += f'      <table align="left" role="presentation" border="0" cellpadding="0" cellspacing="0" width="{h_gap}" style="width:{h_gap}px;"><tr><td>&nbsp;</td></tr></table>\n'

                cls = el['class_name']
                styles = []
                if el.get('bg_color'):
                    styles.append(f"background-color:{el['bg_color']}")
                if el.get('bg_color') and el['text']:
                    styles.append("padding:10px 18px")
                    cls += " pill"

                if styles:
                    css_rules.append(f".{cls} {{ {'; '.join(styles)} }}")

                # Clean and add class
                el_soup = el['soup']
                if 'class' in el_soup.attrs:
                    del el_soup['class']
                el_soup['class'] = cls + " mobile-stack"

                sec_html += f'      <table align="left" role="presentation" border="0" cellpadding="0" cellspacing="0" class="{cls}">\n'
                sec_html += f'        <tr><td>{str(el_soup)}</td></tr>\n'
                sec_html += '      </table>\n'

                prev_right = el['rect']['right']

            sec_html += '    </td></tr>\n'

        sec_html += '  </table>\n</td></tr>'
        html_rows.append(sec_html)
        prev_bottom = max((e['rect']['bottom'] for e in section), default=prev_bottom)

    # 5. Handle decorative graphic (if any)
    graphic = next((el for el in elements if el['class_name'] == "decorative-graphic"), None)
    if not graphic:
        # Fallback if specific class naming missed it
        graphic = next((el for el in elements if el['has_img'] and el['rect']['width'] > 80 and el['rect']['top'] > 500), None)
        
    if graphic:
        cls = graphic.get('class_name', 'decorative-graphic')
        css_rules.append(f".{cls} {{ position:relative; float:right; margin-top:-145px; z-index:10; }}")
        graphic_row = f'''<tr><td align="right" style="line-height:0; font-size:0;">
            <div class="{cls}">{str(graphic['soup'])}</div>
        </td></tr>'''
        html_rows.insert(-1, graphic_row)  # Place before footer

    # Final Output
    style_block = "\n    ".join(css_rules)
    final_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email</title>
    <style>
    {style_block}
    </style>
</head>
<body>
    <center>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="container-main" width="{container_width}">
{chr(10).join(html_rows)}
        </table>
    </center>
</body>
</html>"""

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(final_html)

    print(f"✅ Dynamic conversion completed: {output_path}")

if __name__ == "__main__":
    convert('index.html', 'grok_converted_index.html')
