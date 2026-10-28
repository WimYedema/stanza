-- Spike filter for DOCX -> Markdown: removes layout artifacts and Word-specific noise.

local drop_styles = { ["annotation reference"] = true }
-- Implied by the list type; mapped back when rendering.
local unwrap_styles = { ["List Bullet"] = true, ["List Number"] = true, ["List Paragraph"] = true }

local function is_blank(inlines)
  if pandoc.utils.stringify(inlines):match('%S') then return false end
  local has_media = false
  pandoc.Inlines(inlines):walk({
    Image = function() has_media = true end,
    Note = function() has_media = true end,
  })
  return not has_media
end

local function trim_trailing(el)
  local n = #el.content
  while n > 0 and (el.content[n].t == 'Space' or el.content[n].t == 'SoftBreak' or el.content[n].t == 'LineBreak') do
    el.content:remove(n)
    n = n - 1
  end
  return el
end

function Span(el)
  local style = el.attributes['custom-style']
  if drop_styles[style] then return {} end
  if style == 'Strong' then return pandoc.Strong(el.content) end
  if style == 'Emphasis' then return pandoc.Emph(el.content) end
end

function Para(el)
  if is_blank(el.content) then return {} end
  return trim_trailing(el)
end

function Plain(el)
  if is_blank(el.content) then return {} end
  return trim_trailing(el)
end

-- Column proportions of the original tables, in document order (written by roundtrip.py).
local widths = {}
local widths_path = os.getenv('PHRASE_TABLE_WIDTHS')
if widths_path then
  for line in io.lines(widths_path) do
    local row = {}
    for n in line:gmatch('%d+') do row[#row + 1] = tonumber(n) end
    widths[#widths + 1] = row
  end
end
local table_index = 0

-- Layout tables without any content.
function Table(el)
  local has_media = false
  el:walk({ Image = function() has_media = true end })
  if not pandoc.utils.stringify(el):match('%S') and not has_media then return {} end
  table_index = table_index + 1
  local row = widths[table_index]
  if row and #row == #el.colspecs then
    local total = 0
    for _, w in ipairs(row) do total = total + w end
    for i, w in ipairs(row) do el.colspecs[i] = { el.colspecs[i][1], w / total } end
    return el
  end
end

-- Empty headings are authoring artifacts.
function Header(el)
  if is_blank(el.content) then return {} end
end

function Div(el)
  if unwrap_styles[el.attributes['custom-style']] then return el.content end
  if #el.content == 0 then return {} end
end

local function drop_empty_items(el)
  local kept = {}
  for _, item in ipairs(el.content) do
    if #item > 0 then kept[#kept + 1] = item end
  end
  el.content = kept
  return el
end

BulletList = drop_empty_items
OrderedList = drop_empty_items
