import React from 'react';

const TOOLS = [
  { id: 'select', label: 'Select', title: 'Pick a note to read, reply or change it' },
  { id: 'text', label: 'Highlight', title: 'Select text to highlight it', needsText: true },
  { id: 'mark', label: 'Marker', title: 'Drag to highlight an area' },
  { id: 'box', label: 'Box', title: 'Drag to frame an area' },
  { id: 'pin', label: 'Pin', title: 'Click to pin a note' },
  { id: 'ink', label: 'Draw', title: 'Draw freehand' },
];
const COLORS = ['#ffd54f', '#ff8a65', '#81c784', '#64b5f6', '#ba68c8', '#e57373'];

/** Tool, colour and zoom. hasText: the pages have a text layer (copied pages do, images don't). */
export function Tools({ tool, setTool, color, setColor, zoom, setZoom, hasText, children }) {
  return (
    <div className="pdf-tools">
      <div className="pdf-tool-group">
        {TOOLS.filter((t) => !t.needsText || hasText).map((t) => (
          <button key={t.id} type="button" title={t.title} className={tool === t.id ? 'active' : ''} onClick={() => setTool(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="pdf-tool-group">
        {COLORS.map((c) => (
          <button key={c} type="button" title={c} aria-label={`Colour ${c}`} className={`pdf-color${color === c ? ' active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
        ))}
      </div>
      <div className="pdf-tool-group">
        <button type="button" title="Smaller" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}>−</button>
        <span className="pdf-zoom">{Math.round(zoom * 100)}%</span>
        <button type="button" title="Bigger" onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))}>+</button>
      </div>
      {children}
    </div>
  );
}
