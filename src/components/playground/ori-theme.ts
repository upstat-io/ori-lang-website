import type * as Monaco from 'monaco-editor';

export const oriDarkTheme: Monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    // Keywords - sage accent
    { token: 'keyword', foreground: '7eb7a6' },
    // Functions - brighter sage
    { token: 'entity.name.function', foreground: 'a0d2ce' },
    // Parameters - secondary text
    { token: 'variable.parameter', foreground: 'aca9a3' },
    // Types - copper
    { token: 'type', foreground: 'd9bd7d' },
    // Identifiers - primary text
    { token: 'identifier', foreground: 'd8d7d3' },
    // Strings - warm sand
    { token: 'string', foreground: 'd4a583' },
    { token: 'string.quote', foreground: 'd4a583' },
    { token: 'string.escape', foreground: 'e0b088' },
    { token: 'string.invalid', foreground: 'e84040' },
    // Numbers - soft lavender
    { token: 'number', foreground: 'b4a7d6' },
    { token: 'number.float', foreground: 'b4a7d6' },
    { token: 'number.hex', foreground: 'b4a7d6' },
    // Comments - warm muted
    { token: 'comment', foreground: '908f8b' },
    // Operators - primary text
    { token: 'operator', foreground: 'd8d7d3' },
    // Punctuation - muted
    { token: 'delimiter', foreground: '868380' },
    { token: 'delimiter.bracket', foreground: 'aca9a3' },
    // Constants (true, false, None, etc) - warm like strings
    { token: 'constant', foreground: 'd4a583' },
    // Attributes - between comment and text
    { token: 'annotation', foreground: '908f8b' },
  ],
  colors: {
    // Backgrounds - warm earth tones
    'editor.background': '#14161a',
    'editor.foreground': '#d8d7d3',
    'editorLineNumber.foreground': '#908f8b',
    'editorLineNumber.activeForeground': '#aca9a3',
    'editorCursor.foreground': '#74b3b0',
    // Selection - sage with alpha
    'editor.selectionBackground': '#74b3b04d',
    'editor.inactiveSelectionBackground': '#74b3b026',
    'editor.selectionHighlightBackground': '#74b3b026',
    'editor.selectionHighlightBorder': '#00000000',
    'editor.wordHighlightBackground': '#74b3b033',
    'editor.wordHighlightBorder': '#00000000',
    'editor.wordHighlightStrongBackground': '#74b3b04d',
    'editor.wordHighlightStrongBorder': '#00000000',
    'editor.findMatchBackground': '#74b3b066',
    'editor.findMatchHighlightBackground': '#74b3b033',
    'editor.findMatchBorder': '#00000000',
    'editor.findMatchHighlightBorder': '#00000000',
    'editor.lineHighlightBackground': '#181a1e',
    'editor.lineHighlightBorder': '#22242a',
    // Scrollbar - warm
    'scrollbar.shadow': '#00000033',
    'scrollbarSlider.background': '#aca9a333',
    'scrollbarSlider.hoverBackground': '#aca9a359',
    'scrollbarSlider.activeBackground': '#aca9a380',
    // Overview ruler
    'editorOverviewRuler.border': '#00000000',
    'editorOverviewRuler.background': '#14161a',
    'editorOverviewRuler.errorForeground': '#908f8b',
    'editorOverviewRuler.warningForeground': '#908f8b',
    'editorOverviewRuler.infoForeground': '#74b3b0',
    'editorOverviewRuler.selectionHighlightForeground': '#74b3b04d',
    'editorOverviewRuler.findMatchForeground': '#74b3b080',
    'editorOverviewRuler.rangeHighlightForeground': '#74b3b04d',
    'editorOverviewRuler.modifiedForeground': '#908f8b',
    'editorOverviewRuler.addedForeground': '#908f8b',
    'editorOverviewRuler.deletedForeground': '#908f8b',
    'editorOverviewRuler.wordHighlightForeground': '#74b3b04d',
    'editorOverviewRuler.wordHighlightStrongForeground': '#74b3b04d',
    'editorOverviewRuler.wordHighlightTextForeground': '#74b3b04d',
    'editorOverviewRuler.currentContentForeground': '#908f8b',
    'editorOverviewRuler.incomingContentForeground': '#908f8b',
    'editorOverviewRuler.commonContentForeground': '#908f8b',
    // Widget - warm
    'editorWidget.background': '#22242a',
    'editorWidget.border': '#30333a',
    'editorSuggestWidget.background': '#22242a',
    'editorSuggestWidget.border': '#30333a',
    'editorSuggestWidget.selectedBackground': '#30333a',
    // Misc
    'editorIndentGuide.background': '#22242a',
    'editorIndentGuide.activeBackground': '#33353c',
    // Bracket matching - sage
    'editorBracketMatch.background': '#74b3b026',
    'editorBracketMatch.border': '#74b3b080',
    // Bracket pair colorization - warm muted
    'editorBracketHighlight.foreground1': '#aca9a3',
    'editorBracketHighlight.foreground2': '#aca9a3',
    'editorBracketHighlight.foreground3': '#aca9a3',
    'editorBracketHighlight.foreground4': '#aca9a3',
    'editorBracketHighlight.foreground5': '#aca9a3',
    'editorBracketHighlight.foreground6': '#aca9a3',
    'editorBracketHighlight.unexpectedBracket.foreground': '#aca9a3',
    // Bracket pair guides
    'editorBracketPairGuide.activeBackground1': '#aca9a3',
    'editorBracketPairGuide.activeBackground2': '#aca9a3',
    'editorBracketPairGuide.activeBackground3': '#aca9a3',
    'editorBracketPairGuide.activeBackground4': '#aca9a3',
    'editorBracketPairGuide.activeBackground5': '#aca9a3',
    'editorBracketPairGuide.activeBackground6': '#aca9a3',
    'editorBracketPairGuide.background1': '#00000000',
    'editorBracketPairGuide.background2': '#00000000',
    'editorBracketPairGuide.background3': '#00000000',
    'editorBracketPairGuide.background4': '#00000000',
    'editorBracketPairGuide.background5': '#00000000',
    'editorBracketPairGuide.background6': '#00000000',
    // Overview ruler brackets
    'editorOverviewRuler.bracketMatchForeground': '#74b3b0',
    // Error squiggles and markers
    'editorError.foreground': '#d45a68',
    'editorError.border': '#00000000',
    'editorWarning.foreground': '#c4944a',
    'editorWarning.border': '#00000000',
    'editorInfo.foreground': '#74b3b0',
    'editorInfo.border': '#00000000',
  },
};
