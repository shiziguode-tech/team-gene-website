import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// Extend the existing vector identity with deterministic, crisp typography.
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#123c32"/>
<g fill="none" stroke="#d6dccb" opacity=".16">
  <circle cx="1060" cy="310" r="233"/><circle cx="1060" cy="310" r="175"/>
  <ellipse cx="1060" cy="310" rx="280" ry="94" transform="rotate(-32 1060 310)"/>
  <path d="M860 76 1030 150 960 290 1140 395 965 555M1030 150 1140 395M960 290 1210 180M860 76 960 290 965 555"/>
</g>
<g fill="#b96747"><circle cx="1030" cy="150" r="8"/><circle cx="960" cy="290" r="10"/><circle cx="1140" cy="395" r="8"/><circle cx="965" cy="555" r="6"/></g>
<g transform="translate(88 72)"><circle cx="26" cy="26" r="25" stroke="#e9ece0" stroke-width="1.5" fill="none"/><ellipse cx="26" cy="26" rx="30" ry="10" transform="rotate(-28 26 26)" stroke="#c7815e" stroke-width="1.5" fill="none"/><text x="26" y="36" text-anchor="middle" font-family="Georgia,serif" font-size="29" fill="#f4f2ec">G</text></g>
<text x="166" y="106" fill="#dce3d6" font-family="Arial,sans-serif" font-size="18" letter-spacing="4">CS &amp; AI RESEARCH GROUP</text>
<rect x="88" y="199" width="52" height="4" fill="#c7815e"/>
<text x="80" y="326" fill="#f4f2ec" font-family="Georgia,serif" font-size="112" letter-spacing="1">Team Gene</text>
<text x="88" y="404" fill="#dfe5da" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" font-size="34" letter-spacing="5">计算机科学与人工智能</text>
<path d="M88 511H1112" stroke="#dce3d6" opacity=".25"/>
<text x="88" y="563" fill="#e4e8dd" font-family="Arial,sans-serif" font-size="24" letter-spacing="2">team-gene.com</text>
<text x="1112" y="561" text-anchor="end" fill="#c7815e" font-family="Arial,sans-serif" font-size="15" letter-spacing="3">RESEARCH · COLLABORATION · COMMUNITY</text>
</svg>`;
const directory=fileURLToPath(new URL('../public/share/',import.meta.url));
await mkdir(directory,{recursive:true});
await writeFile(directory+'team-gene.svg',svg);
await sharp(Buffer.from(svg)).png().toFile(directory+'team-gene.png');
console.log('Generated brand share image: 1200 × 630');
