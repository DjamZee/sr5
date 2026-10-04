/**
 * Validates Handlebars templates for block helper balance.
 * Usage: node scripts/validate-templates.js [files...]
 * If no files given, scans all templates/**\/*.hbs
 */
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const files = args.length > 0 ? args : globHbs('templates')  // scans .html and .hbs

let hasErrors = false

// A {{> partial}} that modules/templates.js does not preload breaks the sheet at render time
const preloaded = new Set(fs.readFileSync(path.join(__dirname, '..', 'modules', 'templates.js'), 'utf8')
  .match(/systems\/sr5\/[^"'`\s]+/g) ?? [])

for (const file of files) {
  const errors = validateFile(file).concat(missingPartials(file, preloaded))
  if (errors.length > 0) {
    hasErrors = true
    for (const err of errors) {
      process.stderr.write(`${file}:${err.line}: ${err.message}\n`)
    }
  }
}

if (!hasErrors) {
  console.log(`Templates OK (${files.length} files checked)`)
}

process.exit(hasErrors ? 1 : 0)

function validateFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const errors = []
  const stack = []

  // Build position → line number lookup
  const lineStarts = [0]
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') lineStarts.push(i + 1)
  }
  function lineOf(pos) {
    let lo = 0, hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid] <= pos) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }

  // Matches:
  //   opening: {{~? #? name ... }} (allows space after # and multiline args)
  //   closing: {{~? /name ~?}}
  const tokenRe = /\{\{[~]?\s*#\s*(\w+)[\s\S]*?\}\}|\{\{[~]?\s*\/(\w+)\s*[~]?\}\}/g

  let m
  while ((m = tokenRe.exec(content)) !== null) {
    if (m[1]) {
      stack.push({
        name: m[1], line: lineOf(m.index) 
      })
    } else if (m[2]) {
      const name = m[2]
      const line = lineOf(m.index)
      if (stack.length === 0) {
        errors.push({
          line, message: `Unexpected {{/${name}}} — no open block` 
        })
      } else {
        const top = stack[stack.length - 1]
        if (top.name !== name) {
          errors.push({
            line,
            message: `Mismatched block: expected {{/${top.name}}} (opened at line ${top.line}), got {{/${name}}}`,
          })
        }
        stack.pop()
      }
    }
  }

  for (const unclosed of stack) {
    errors.push({
      line: unclosed.line, message: `Unclosed {{#${unclosed.name}}} block` 
    })
  }

  return errors
}

// Static partials only: a {{> (expression)}} is resolved at render time
function missingPartials(filePath, preloaded) {
  const content = fs.readFileSync(filePath, 'utf8')
  const errors = []
  const partialRe = /\{\{~?>\s*["']?(systems\/sr5\/[^\s"'}]+)/g
  let m
  while ((m = partialRe.exec(content)) !== null) {
    if (!preloaded.has(m[1])) {
      errors.push({
        line: content.slice(0, m.index).split('\n').length,
        message: `Partial ${m[1]} is not preloaded in modules/templates.js`,
      })
    }
  }
  return errors
}

function globHbs(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) {
      results.push(...globHbs(full))
    } else if (full.endsWith('.hbs') || full.endsWith('.html')) {
      results.push(full)
    }
  }
  return results
}
