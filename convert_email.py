import os
import re
import uuid
from bs4 import BeautifulSoup

def parse_style(style_str):
    res = {}
    if not style_str: return res
    for item in style_str.split(';'):
        if ':' in item:
            key, val = item.split(':', 1)
            res[key.strip().lower()] = val.strip().lower()
    return res

def get_rect(el):
    style = parse_style(el.get('style', ''))
    try:
        top = int(re.search(r'\d+', style.get('top', '0')).group())
        left = int(re.search(r'\d+', style.get('left', '0')).group())
        width = int(re.search(r'\d+', style.get('width', '0')).group())
        height = int(re.search(r'\d+', style.get('height', '0')).group())
    except AttributeError:
        top, left, width, height = 0, 0, 0, 0
    return {'top': top, 'left': left, 'width': width, 'height': height, 'right': left + width, 'bottom': top + height}

def is_overlapping(r1, r2):
    return not (r1['right'] <= r2['left'] or r1['left'] >= r2['right'] or r1['bottom'] <= r2['top'] or r1['top'] >= r2['bottom'])

def is_near(r1, r2, threshold=15):
    h_dist = max(0, r2['left'] - r1['right'], r1['left'] - r2['right'])
    v_dist = max(0, r2['top'] - r1['bottom'], r1['top'] - r2['bottom'])
    return h_dist < threshold and v_dist < threshold

def convert(input_path, output_path):
    with open(input_path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f, 'html.parser')

    container = soup.find('div', style=lambda s: s and 'position:relative' in s.replace(' ', ''))
    if not container: return

    container_style = parse_style(container.get('style', ''))
    container_width = int(re.search(r'\d+', container_style.get('width', '600')).group())
    container_bg = container_style.get('background-color', '#ffffff')

    elements = []
    for table in container.find_all('table', recursive=False):
        rect = get_rect(table)
        content_cell = table.find('td')
        is_empty = content_cell and content_cell.get_text(strip=True) == '' and not content_cell.find('img')
        bg_color = parse_style(table.get('style', '')).get('background-color')
        if not bg_color and content_cell:
            bg_color = parse_style(content_cell.get('style', '')).get('background-color') or content_cell.get('bgcolor')

        if is_empty and not bg_color: continue
        
        elements.append({
            'rect': rect,
            'soup': table,
            'id': f"el-{uuid.uuid4().hex[:8]}",
            'has_img': bool(table.find('img')),
            'bg_color': bg_color,
            'is_graphic': bool(table.find('img') and rect['width'] > 90 and rect['top'] > 600)
        })

    # 1. Merge background spacers
    refined_elements = []
    merged_ids = set()
    for i in range(len(elements)):
        if elements[i]['id'] in merged_ids: continue
        curr = elements[i]
        merged = False
        if curr['bg_color'] and not curr['has_img'] and curr['soup'].get_text(strip=True) == '':
            for j in range(len(elements)):
                if i == j or elements[j]['id'] in merged_ids: continue
                other = elements[j]
                if is_overlapping(curr['rect'], other['rect']):
                    other['bg_color'] = curr['bg_color']
                    merged_ids.add(curr['id'])
                    merged = True
                    break
        if not merged: refined_elements.append(curr)

    # 2. Sectional Clustering
    clusters = []
    for el in [e for e in refined_elements if not e['is_graphic']]:
        found = False
        for c in clusters:
            if any(is_near(el['rect'], m['rect'], threshold=40) for m in c):
                c.append(el)
                found = True
                break
        if not found: clusters.append([el])

    changed = True
    while changed:
        changed = False
        for i in range(len(clusters)):
            for j in range(i + 1, len(clusters)):
                if any(is_near(m1['rect'], m2['rect'], threshold=40) for m1 in clusters[i] for m2 in clusters[j]):
                    clusters[i].extend(clusters[j])
                    clusters.pop(j)
                    changed = True
                    break
            if changed: break

    sections = []
    for c in clusters:
        sec_top = min(m['rect']['top'] for m in c)
        sec_left = min(m['rect']['left'] for m in c)
        sec_right = max(m['rect']['right'] for m in c)
        sec_bottom = max(m['rect']['bottom'] for m in c)
        sections.append({'top': sec_top, 'left': sec_left, 'width': sec_right - sec_left, 'height': sec_bottom - sec_top, 'members': c})
    sections.sort(key=lambda x: x['top'])

    # CSS Collection
    css_rules = [
        f".container-main {{ width: 100%; max-width: {container_width}px; margin: 0 auto; background-color: {container_bg}; border-collapse: collapse; table-layout: fixed; }}",
        "body { margin: 0; padding: 0; background-color: #f7f9fc; -webkit-text-size-adjust: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #22386f; }",
        "img { display: block; border: 0; outline: none; text-decoration: none; max-width: 100%; height: auto; }",
        ".pill { border-radius: 20px !important; display: inline-block; }",
        ".text-white, .text-white span { color: #ffffff !important; }",
        ".footer-text { font-size: 7px !important; line-height: 1.2 !important; color: #555555 !important; }",
        "@media screen and (max-width: 600px) { .mobile-stack { display: block !important; width: 100% !important; padding: 10px 0 !important; } .container-main { width: 100% !important; } }"
    ]

    new_html_rows = []
    prev_section_bottom = 0

    for sec in sections:
        v_gap = sec['top'] - prev_section_bottom
        if v_gap > 0:
            new_html_rows.append(f'            <tr><td height="{v_gap}" style="font-size:1px; line-height:1px;">&nbsp;</td></tr>')
        
        # Section Content using standard table row
        sec_html = '            <tr><td align="left" valign="top">\n'
        sec_html += '                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">\n'
        
        # Row-based layout within section
        sec['members'].sort(key=lambda x: (x['rect']['top'], x['rect']['left']))
        sub_rows = []
        curr_row = [sec['members'][0]]
        for i in range(1, len(sec['members'])):
            if sec['members'][i]['rect']['top'] - curr_row[-1]['rect']['top'] < 10:
                curr_row.append(sec['members'][i])
            else:
                sub_rows.append(curr_row)
                curr_row = [sec['members'][i]]
        sub_rows.append(curr_row)

        for s_row in sub_rows:
            s_row.sort(key=lambda x: x['rect']['left'])
            sec_html += '                    <tr><td style="font-size:0;">\n'
            
            # Start from section left edge
            prev_m_right = 0 
            # If the row is just one element and far right, handle alignment
            is_right = len(s_row) == 1 and s_row[0]['rect']['left'] > (container_width / 2)
            
            if is_right:
                sec_html += f'                        <div align="right">\n'

            for m in s_row:
                h_gap = m['rect']['left'] - prev_m_right
                if h_gap > 0 and not is_right:
                    sec_html += f'                        <!--[if mso]><table role="presentation" border="0" cellpadding="0" cellspacing="0" style="display:inline-block; border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; width:{h_gap}px;"><tr><td width="{h_gap}">&nbsp;</td></tr></table><![endif]-->\n'
                    sec_html += f'                        <div class="col-wrap" style="width: {h_gap}px; font-size:1px;">&nbsp;</div>\n'
                
                m_soup = m['soup']
                style = parse_style(m_soup.get('style', ''))
                essential = {k: v for k, v in style.items() if k not in ['position', 'top', 'left', 'width', 'height', 'font-family']}
                
                is_footer = m['rect']['top'] > 750
                classes = [m['id'], 'col-wrap', 'mobile-stack']
                if is_footer: classes.append('footer-text')
                if m['bg_color']:
                    essential['background-color'] = m['bg_color']
                    classes.append('pill')
                    essential['padding'] = '8px 16px'
                    if any(c in m['bg_color'].lower() for c in ['#91', '#21', '#22']): classes.append('text-white')

                css_rules.append(f".{m['id']} {{ {'; '.join([f'{k}: {v}' for k, v in essential.items()])} }}")
                m_soup.attrs['class'] = m_soup.get('class', []) + [m['id']]
                del m_soup['style']

                m_width = f"width: {m['rect']['width']}px;" if not is_right else ""
                sec_html += f'                        <div class="{" ".join(classes)}" style="{m_width} vertical-align:middle;">\n'
                sec_html += f'                            {str(m_soup)}\n'
                sec_html += f'                        </div>\n'
                prev_m_right = m['rect']['right']

            if is_right: sec_html += '                        </div>\n'
            sec_html += '                    </td></tr>\n'
            
        sec_html += '                </table>\n'
        sec_html += '            </td></tr>'
        new_html_rows.append(sec_html)
        prev_section_bottom = sec['top'] + sec['height']

    # Final graphic
    graphic = next((el for el in refined_elements if el['is_graphic']), None)
    if graphic:
        g_id = graphic['id']
        css_rules.append(f".{g_id} {{ width: {graphic['rect']['width']}px; float: right; margin-top: -120px; z-index:100; position:relative; }}")
        graphic_row = f'            <tr><td align="right" valign="top" style="line-height:0; font-size:0;">\n                <div class="{g_id}">\n                    {str(graphic["soup"])}\n                </div>\n            </td></tr>'
        new_html_rows.insert(-1, graphic_row)

    style_block = "\n    ".join(css_rules)
    rows_joined = "\n".join(new_html_rows)
    
    final_output = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Precision Responsive Email</title>
    <style>
    {style_block}
    </style>
</head>
<body>
    <center>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="container-main" width="595">
{rows_joined}
        </table>
    </center>
</body>
</html>"""
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(final_output)

if __name__ == "__main__":
    convert('index.html', 'converted_index.html')
    print("Precision Robust conversion complete.")
