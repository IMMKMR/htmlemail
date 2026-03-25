export function convertFig2Html(htmlInput: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlInput, 'text/html');

  const container = doc.querySelector('div[style*="position:relative"]');
  if (!container) return "Could not find a relative container.";

  const containerStyle = parseStyle(container.getAttribute('style') || '');
  const containerWidth = parseInt(containerStyle['width'] || '595', 10);
  const containerBg = containerStyle['background-color'] || '#ffffff';

  interface Rect { top: number; left: number; width: number; height: number; right: number; bottom: number; }
  interface ElementData { rect: Rect; element: HTMLElement; id: string; hasImg: boolean; bgColor: string | null; isGraphic: boolean; }

  const elements: ElementData[] = [];
  const tables = Array.from(container.querySelectorAll('table'));
  
  tables.forEach((table) => {
    if (table.parentElement !== container) return;
    const rect = getRect(table);
    const content = table.querySelector('td');
    const isEmpty = content && content.textContent?.trim() === '' && !content.querySelector('img');
    const style = parseStyle(table.getAttribute('style') || '');
    let bgColor = style['background-color'] || null;
    if (!bgColor && content) {
      const cStyle = parseStyle(content.getAttribute('style') || '');
      bgColor = cStyle['background-color'] || content.getAttribute('bgcolor') || null;
    }

    if (isEmpty && !bgColor) return;

    elements.push({
      rect,
      element: table.cloneNode(true) as HTMLElement,
      id: `el-${Math.random().toString(36).substr(2, 8)}`,
      hasImg: !!table.querySelector('img'),
      bgColor,
      isGraphic: !!(table.querySelector('img') && rect.width > 90 && rect.top > 600)
    });
  });

  // 1. Merge background spacers
  const mergedIds = new Set<string>();
  const refined: ElementData[] = [];
  elements.forEach((el, i) => {
    if (mergedIds.has(el.id)) return;
    let merged = false;
    if (el.bgColor && !el.hasImg && el.element.textContent?.trim() === '') {
      elements.forEach((other, j) => {
        if (i !== j && !mergedIds.has(other.id) && isOverlapping(el.rect, other.rect)) {
          other.bgColor = el.bgColor;
          mergedIds.add(el.id);
          merged = true;
        }
      });
    }
    if (!merged) refined.push(el);
  });

  // 2. Clustering
  const clusters: ElementData[][] = [];
  const nonGraphics = refined.filter(e => !e.isGraphic);
  nonGraphics.forEach(el => {
    let clusterFound = false;
    for (const c of clusters) {
      if (c.some(m => isNear(el.rect, m.rect, 40))) {
        c.push(el);
        clusterFound = true;
        break;
      }
    }
    if (!clusterFound) clusters.push([el]);
  });

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
            if (clusters[i].some(m1 => clusters[j].some(m2 => isNear(m1.rect, m2.rect, 40)))) {
                clusters[i].push(...clusters[j]);
                clusters.splice(j, 1);
                changed = true; break;
            }
        }
        if (changed) break;
    }
  }

  const sections = clusters.map(c => {
    const top = Math.min(...c.map(m => m.rect.top));
    const left = Math.min(...c.map(m => m.rect.left));
    const right = Math.max(...c.map(m => m.rect.right));
    const bottom = Math.max(...c.map(m => m.rect.bottom));
    return { top, left, width: right - left, height: bottom - top, members: c };
  });
  sections.sort((a, b) => a.top - b.top);

  const cssRules: string[] = [
    `.container-main { width: 100%; max-width: ${containerWidth}px; margin: 0 auto; background-color: ${containerBg}; border-collapse: collapse; table-layout: fixed; }`,
    "body { margin: 0; padding: 0; background-color: #f7f9fc; -webkit-text-size-adjust: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #22386f; }",
    "img { display: block; border: 0; outline: none; text-decoration: none; max-width: 100%; height: auto; }",
    ".pill { border-radius: 20px !important; display: inline-block; overflow: hidden; }",
    ".col-wrap { display: inline-block; vertical-align: top; }",
    ".text-white, .text-white span { color: #ffffff !important; }",
    ".footer-text { font-size: 7px !important; line-height: 1.2 !important; color: #555555 !important; }",
    "@media screen and (max-width: 600px) { .mobile-stack { display: block !important; width: 100% !important; margin-bottom: 20px; text-align: left !important; } .container-main { width: 100% !important; } }"
  ];

  let newHtmlRows: string[] = [];
  let prevSectionBottom = 0;
  const graphic = refined.find(e => e.isGraphic);

  sections.forEach(sec => {
    const vGap = sec.top - prevSectionBottom;
    if (vGap > 0) newHtmlRows.push(`            <tr><td height="${vGap}" style="font-size:1px; line-height:1px;">&nbsp;</td></tr>`);
    
    let secHtml = '            <tr><td align="left" valign="top">\n';
    secHtml += '                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">\n';
    
    sec.members.sort((a,b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
    const subRows: ElementData[][] = [];
    let curr = [sec.members[0]];
    for (let i = 1; i < sec.members.length; i++) {
      if (sec.members[i].rect.top - curr[curr.length-1].rect.top < 10) curr.push(sec.members[i]);
      else { subRows.push(curr); curr = [sec.members[i]]; }
    }
    subRows.push(curr);

    subRows.forEach(row => {
      row.sort((a,b) => a.rect.left - b.rect.left);
      secHtml += '                    <tr><td style="font-size:0;">\n';
      let prevMRight = 0;
      const isRight = row.length === 1 && row[0].rect.left > (containerWidth / 2);

      if (isRight) secHtml += '                        <div align="right">\n';

      row.forEach(m => {
        const hGap = m.rect.left - prevMRight;
        if (hGap > 0 && !isRight) {
          secHtml += `                        <div class="col-wrap" style="width: ${hGap}px; font-size:1px;">&nbsp;</div>\n`;
        }

        const style = parseStyle(m.element.getAttribute('style') || '');
        const essential: Record<string, string> = {};
        Object.entries(style).forEach(([k,v]) => { if (!['position','top','left','width','height','font-family'].includes(k)) essential[k]=v; });
        
        const isFooter = m.rect.top > 750;
        const classes = [m.id, 'col-wrap', 'mobile-stack'];
        if (isFooter) classes.push('footer-text');
        if (m.bgColor) {
          essential['background-color'] = m.bgColor; classes.push('pill'); essential['padding'] = '8px 16px';
          if (['#91','#21','#22'].some(c => m.bgColor!.toLowerCase().includes(c))) classes.push('text-white');
        }
        cssRules.push(`.${m.id} { ${Object.entries(essential).map(([k,v])=>`${k}: ${v}`).join("; ")} }`);
        m.element.removeAttribute('style'); m.element.classList.add(m.id);
        secHtml += `                        <div class="${classes.join(' ')}" style="${!isRight ? `width:${m.rect.width}px;` : ''} vertical-align:middle;">\n                    ${m.element.outerHTML}\n                </div>\n`;
        prevMRight = m.rect.right;
      });
      if (isRight) secHtml += '                        </div>\n';
      secHtml += '                    </td></tr>\n';
    });
    secHtml += '                </table>\n            </td></tr>';
    newHtmlRows.push(secHtml);
    prevSectionBottom = sec.top + sec.height;
  });

  if (graphic) {
    const gId = graphic.id;
    cssRules.push(`.${gId} { width: ${graphic.rect.width}px; float: right; margin-top: -120px; z-index: 100; position: relative; }`);
    const graphicHtml = `            <tr><td align="right" valign="top" style="line-height: 0; font-size: 0;">\n                <div class="${gId}">\n                    ${graphic.element.outerHTML}\n                </div>\n            </td></tr>`;
    newHtmlRows.insert(-1, graphicHtml);
  }

  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>Precision Responsive Email</title>\n    <style>\n    ${cssRules.join('\n    ')}\n    </style>\n</head>\n<body>\n    <center>\n        <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="container-main" width="595">\n${newHtmlRows.join('\n')}        </table>\n    </center>\n</body>\n</html>`;
}

function parseStyle(s: string) {
  const r: Record<string, string> = {};
  if (!s) return r;
  s.split(';').forEach(i => { if (i.includes(':')) { const p = i.split(':'); r[p[0].trim().toLowerCase()] = p.slice(1).join(':').trim().toLowerCase(); } });
  return r;
}
function getRect(el: HTMLElement) {
  const s = parseStyle(el.getAttribute('style') || '');
  const t = parseInt(s['top'] || '0', 10), l = parseInt(s['left'] || '0', 10), w = parseInt(s['width'] || '0', 10), h = parseInt(s['height'] || '0', 10);
  return { top: t, left: l, width: w, height: h, right: l+w, bottom: t+h };
}
function isOverlapping(r1: any, r2: any) { return !(r1.right <= r2.left || r1.left >= r2.right || r1.bottom <= r2.top || r1.top >= r2.bottom); }
function isNear(r1: any, r2: any, t: number) { return Math.max(0, r2.left - r1.right, r1.left - r2.right) < t && Math.max(0, r2.top - r1.bottom, r1.top - r2.bottom) < t; }

// Extension for splice/insert
declare global {
  interface Array<T> {
    insert(index: number, item: T): void;
  }
}
Array.prototype.insert = function (index, item) {
  this.splice(index, 0, item);
};
