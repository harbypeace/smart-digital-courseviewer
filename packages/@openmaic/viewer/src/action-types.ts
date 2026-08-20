// Minimal action types — self-contained copy for the viewer package

export interface ActionBase {
  id: string;
  title?: string;
  description?: string;
}

export interface SpotlightAction extends ActionBase {
  type: 'spotlight';
  elementId: string;
  dimOpacity?: number;
}

export interface LaserAction extends ActionBase {
  type: 'laser';
  elementId: string;
  color?: string;
}

export interface SpeechAction extends ActionBase {
  type: 'speech';
  text: string;
  audioId?: string;
  audioUrl?: string;
  voice?: string;
  speed?: number;
  visualUrl?: string;
  visualCaption?: string;
}

export interface WbOpenAction extends ActionBase {
  type: 'wb_open';
}

export interface WbDrawTextAction extends ActionBase {
  type: 'wb_draw_text';
  elementId?: string;
  content: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
  color?: string;
}

export interface WbDrawShapeAction extends ActionBase {
  type: 'wb_draw_shape';
  elementId?: string;
  shape: 'rectangle' | 'circle' | 'triangle';
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor?: string;
}

export interface WbDrawChartAction extends ActionBase {
  type: 'wb_draw_chart';
  elementId?: string;
  chartType: 'bar' | 'column' | 'line' | 'pie' | 'ring' | 'area' | 'radar' | 'scatter';
  x: number;
  y: number;
  width: number;
  height: number;
  data: { labels: string[]; legends: string[]; series: number[][] };
  themeColors?: string[];
}

export interface WbDrawLatexAction extends ActionBase {
  type: 'wb_draw_latex';
  elementId?: string;
  latex: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
}

export interface WbDrawTableAction extends ActionBase {
  type: 'wb_draw_table';
  elementId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: string[][];
  outline?: { width: number; style: string; color: string };
  theme?: { color: string };
}

export interface WbDrawLineAction extends ActionBase {
  type: 'wb_draw_line';
  elementId?: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color?: string;
  width?: number;
  style?: 'solid' | 'dashed';
  points?: ['', 'arrow'] | ['arrow', ''] | ['arrow', 'arrow'] | ['', ''];
}

export interface WbDrawCodeAction extends ActionBase {
  type: 'wb_draw_code';
  elementId?: string;
  language: string;
  code: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fileName?: string;
}

export interface WbEditCodeAction extends ActionBase {
  type: 'wb_edit_code';
  elementId: string;
  operation: 'insert_after' | 'insert_before' | 'delete_lines' | 'replace_lines';
  lineId?: string;
  lineIds?: string[];
  content?: string;
}

export interface WbClearAction extends ActionBase {
  type: 'wb_clear';
}

export interface WbDeleteAction extends ActionBase {
  type: 'wb_delete';
  elementId: string;
}

export interface WbCloseAction extends ActionBase {
  type: 'wb_close';
}

export interface PlayVideoAction extends ActionBase {
  type: 'play_video';
  elementId: string;
}

export interface DiscussionAction extends ActionBase {
  type: 'discussion';
  topic: string;
  prompt?: string;
  agentId?: string;
}

export type Action =
  | SpotlightAction
  | LaserAction
  | SpeechAction
  | WbOpenAction
  | WbDrawTextAction
  | WbDrawShapeAction
  | WbDrawChartAction
  | WbDrawLatexAction
  | WbDrawTableAction
  | WbDrawLineAction
  | WbDrawCodeAction
  | WbEditCodeAction
  | WbClearAction
  | WbDeleteAction
  | WbCloseAction
  | PlayVideoAction
  | DiscussionAction;
