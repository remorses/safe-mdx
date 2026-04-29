import dedent from 'dedent'
import { generate } from 'escodegen'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { z } from 'zod'
import { mdxParse } from './parse.ts'
import { MdastToJsx, mdastBfs, type ComponentPropsSchema, type EvaluateOptions } from './safe-mdx.tsx'
import { completeJsxTags } from './streaming.tsx'

const components = {
    Heading({ level, children, ...props }) {
        return <h1 {...props}>{children}</h1>
    },
    Cards({ level, children, ...props }) {
        return <div {...props}>{children}</div>
    },
    Tabs({ items, children, ...props }) {
        return <div {...props}>{children}</div>
    },
}

function render(code, componentPropsSchema?: ComponentPropsSchema, allowClientEsmImports?: boolean, addMarkdownLineNumbers?: boolean, scope?: Record<string, any>, evaluateOptions?: EvaluateOptions) {
    const mdast = mdxParse(code)
    const visitor = new MdastToJsx({ markdown: code, mdast, components, componentPropsSchema, allowClientEsmImports, addMarkdownLineNumbers, scope, evaluateOptions })
    const result = visitor.run()
    const html = renderToStaticMarkup(result)
    // console.log(JSON.stringify(result, null, 2))
    return { result, errors: visitor.errors || [], html }
}


test('reference links with titles', () => {
    const code = dedent`
    > **Heads-up:** Check the [API docs][1] for more info.

    Visit [Slack developers][2] for details.

    [1]: https://api.slack.com/methods/search.messages "search.messages method - Slack API"
    [2]: https://slack.dev/secure-data-connectivity/ "Secure Data Connectivity - Slack Developers"
    `
    
    const { html } = render(code)
    expect(html).toMatchInlineSnapshot(`"<blockquote><p><strong>Heads-up:</strong> Check the <a href="https://api.slack.com/methods/search.messages" title="search.messages method - Slack API">API docs</a> for more info.</p></blockquote><p>Visit <a href="https://slack.dev/secure-data-connectivity/" title="Secure Data Connectivity - Slack Developers">Slack developers</a> for details.</p>"`)
})

test('markdown inside jsx', () => {
    const code = dedent`
    # Hello

    <Heading prop="value">
    Component *children*
    </Heading>

    <figure>
    some *bold* content
    </figure>

    `

    expect(render(code)).toMatchInlineSnapshot(`
      {
        "errors": [],
        "html": "<h1>Hello</h1><h1 prop="value"><p>Component <em>children</em></p></h1><figure><p>some <em>bold</em> content</p></figure>",
        "result": <React.Fragment>
          <h1>
            Hello
          </h1>
          <Heading
            prop="value"
          >
            <p>
              Component 
              <em>
                children
              </em>
            </p>
          </Heading>
          <figure>
            <p>
              some 
              <em>
                bold
              </em>
               content
            </p>
          </figure>
        </React.Fragment>,
      }
    `)
})

test('can complete jsx code with completeJsxTags', () => {
    const code = dedent`
    # Hello

    <Cards>
    <Heading prop="value">
    some value

    Component *children*



    `

    expect(render(completeJsxTags(code))).toMatchInlineSnapshot(`
      {
        "errors": [],
        "html": "<h1>Hello</h1><div><h1 prop="value"></h1></div>",
        "result": <React.Fragment>
          <h1>
            Hello
          </h1>
          <Cards>
            <Heading
              prop="value"
            />
          </Cards>
        </React.Fragment>,
      }
    `)
})

test('remark and jsx does not wrap in p', () => {
    const code = dedent`
    ---
    title: createSearchParams
    ---

    # Hello

    i am a paragraph

    <Heading>heading</Heading>

    sone \`inline code\`

    \`\`\`tsx
    some code
    \`\`\`

    what
    `
    const mdast = mdxParse(code)

    mdastBfs(mdast, (x) => {
        delete x.position
    })
    expect(mdast).toMatchInlineSnapshot(`
      {
        "children": [
          {
            "type": "yaml",
            "value": "title: createSearchParams",
          },
          {
            "children": [
              {
                "type": "text",
                "value": "Hello",
              },
            ],
            "depth": 1,
            "type": "heading",
          },
          {
            "children": [
              {
                "type": "text",
                "value": "i am a paragraph",
              },
            ],
            "type": "paragraph",
          },
          {
            "attributes": [],
            "children": [
              {
                "type": "text",
                "value": "heading",
              },
            ],
            "name": "Heading",
            "type": "mdxJsxFlowElement",
          },
          {
            "children": [
              {
                "type": "text",
                "value": "sone ",
              },
              {
                "type": "inlineCode",
                "value": "inline code",
              },
            ],
            "type": "paragraph",
          },
          {
            "lang": "tsx",
            "meta": null,
            "type": "code",
            "value": "some code",
          },
          {
            "children": [
              {
                "type": "text",
                "value": "what",
              },
            ],
            "type": "paragraph",
          },
        ],
        "type": "root",
      }
    `)
})

test('basic', () => {
    expect(
        render(dedent`
        # Hello

        i am a paragraph

        <Heading>heading</Heading>
        `),
    ).toMatchInlineSnapshot(`
      {
        "errors": [],
        "html": "<h1>Hello</h1><p>i am a paragraph</p><h1>heading</h1>",
        "result": <React.Fragment>
          <h1>
            Hello
          </h1>
          <p>
            i am a paragraph
          </p>
          <Heading>
            heading
          </Heading>
        </React.Fragment>,
      }
    `)
})
test('frontmatter', () => {
    expect(
        render(dedent`
        ---
        hello: 5
        ---

        # Hello

        i am a paragraph
        `),
    ).toMatchInlineSnapshot(`
      {
        "errors": [],
        "html": "<h1>Hello</h1><p>i am a paragraph</p>",
        "result": <React.Fragment>
          <h1>
            Hello
          </h1>
          <p>
            i am a paragraph
          </p>
        </React.Fragment>,
      }
    `)
})
test('table', () => {
    expect(
        render(dedent`
        # Hello

        | Tables        | Are           | Cool  |
        | ------------- |:-------------:| -----:|
        | col 3 is      | right-aligned | $1600 |
        | col 2 is      | centered      |   $12 |
        `),
    ).toMatchInlineSnapshot(`
      {
        "errors": [],
        "html": "<h1>Hello</h1><table><thead><tr class=""><td class="">Tables</td><td class="">Are</td><td class="">Cool</td></tr></thead><tbody><tr class=""><td class="">col 3 is</td><td class="">right-aligned</td><td class="">$1600</td></tr><tr class=""><td class="">col 2 is</td><td class="">centered</td><td class="">$12</td></tr></tbody></table>",
        "result": <React.Fragment>
          <h1>
            Hello
          </h1>
          <table>
            <thead>
              <tr
                className=""
              >
                <td
                  className=""
                >
                  Tables
                </td>
                <td
                  className=""
                >
                  Are
                </td>
                <td
                  className=""
                >
                  Cool
                </td>
              </tr>
            </thead>
            <tbody>
              <tr
                className=""
              >
                <td
                  className=""
                >
                  col 3 is
                </td>
                <td
                  className=""
                >
                  right-aligned
                </td>
                <td
                  className=""
                >
                  $1600
                </td>
              </tr>
              <tr
                className=""
              >
                <td
                  className=""
                >
                  col 2 is
                </td>
                <td
                  className=""
                >
                  centered
                </td>
                <td
                  className=""
                >
                  $12
                </td>
              </tr>
            </tbody>
          </table>
        </React.Fragment>,
      }
    `)
})
test('table, only head', () => {
    expect(
        render(dedent`
        # Hello

        | Tables        | Are           | Cool  |
        | ------------- |:-------------:| -----:|

        `),
    ).toMatchInlineSnapshot(`
      {
        "errors": [],
        "html": "<h1>Hello</h1><table><thead><tr class=""><td class="">Tables</td><td class="">Are</td><td class="">Cool</td></tr></thead></table>",
        "result": <React.Fragment>
          <h1>
            Hello
          </h1>
          <table>
            <thead>
              <tr
                className=""
              >
                <td
                  className=""
                >
                  Tables
                </td>
                <td
                  className=""
                >
                  Are
                </td>
                <td
                  className=""
                >
                  Cool
                </td>
              </tr>
            </thead>
          </table>
        </React.Fragment>,
      }
    `)
})

test('inline jsx', () => {
    expect(
        render(dedent`
        <Heading level={2}>hello</Heading>
        `),
    ).toMatchInlineSnapshot(`
      {
        "errors": [],
        "html": "<h1>hello</h1>",
        "result": <React.Fragment>
          <Heading
            level={2}
          >
            hello
          </Heading>
        </React.Fragment>,
      }
    `)
})

test('block jsx', () => {
    expect(
        render(dedent`
        <Heading level={2}>
        > hello
        </Heading>
        `),
    ).toMatchInlineSnapshot(`
      {
        "errors": [],
        "html": "<h1><blockquote><p>hello</p></blockquote></h1>",
        "result": <React.Fragment>
          <Heading
            level={2}
          >
            <blockquote>
              <p>
                hello
              </p>
            </blockquote>
          </Heading>
        </React.Fragment>,
      }
    `)
})
test('complex jsx, self closing tags', () => {
    expect(
        render(dedent`
        # hello <br />

        <br />

        content
        `),
    ).toMatchInlineSnapshot(`
      {
        "errors": [],
        "html": "<h1>hello <br/></h1><br/><p>content</p>",
        "result": <React.Fragment>
          <h1>
            hello 
            <br />
          </h1>
          <br />
          <p>
            content
          </p>
        </React.Fragment>,
      }
    `)
})

test('missing components are ignored', () => {
    expect(
        render(dedent`
        <MissingComponent level={2} />
        `),
    ).toMatchInlineSnapshot(`
      {
        "errors": [
          {
            "line": 1,
            "message": "Unsupported jsx component MissingComponent",
            "type": "missing-component",
          },
        ],
        "html": "",
        "result": <React.Fragment />,
      }
    `)
})

test('props parsing', () => {
    expect(
        render(dedent`
        <Heading
            num={2}
            doublequote={"a \" string"}
            quote={'a \' string'}
            backTick={\`some ${'${expr}'} value\`}
            boolean={false}
            expression1={1 + 3}
            expression2={Boolean(1)}
            jsx={<SomeComponent />}
            undef={undefined}
            null={null}
            someJson={{"a": 1}}
            {...{
              spread: true
            }}
        >
        hi
        </Heading>

        `),
    ).toMatchInlineSnapshot(`
      {
        "errors": [
          {
            "line": 8,
            "message": "Failed to evaluate expression attribute: expression2={Boolean(1)}. Functions are not supported",
            "type": "expression",
          },
          {
            "line": 8,
            "message": "Expressions in jsx prop not evaluated: (expression2={Boolean(1)})",
            "type": "expression",
          },
          {
            "line": 9,
            "message": "Unsupported jsx component SomeComponent in attribute",
            "type": "missing-component",
          },
          {
            "line": 9,
            "message": "Failed to evaluate expression attribute: jsx={<SomeComponent />}. visitor "JSXElement" is not supported",
            "type": "expression",
          },
          {
            "line": 9,
            "message": "Expressions in jsx prop not evaluated: (jsx={<SomeComponent />})",
            "type": "expression",
          },
        ],
        "html": "<h1 num="2" doublequote="a &quot; string" quote="a &#x27; string" backTick="some undefined value" expression1="4" someJson="[object Object]"><p>hi</p></h1>",
        "result": <React.Fragment>
          <Heading
            backTick="some undefined value"
            boolean={false}
            doublequote="a " string"
            expression1={4}
            null={null}
            num={2}
            quote="a ' string"
            someJson={
              {
                "a": 1,
              }
            }
            spread={true}
          >
            <p>
              hi
            </p>
          </Heading>
        </React.Fragment>,
      }
    `)
})

test('jsx attributes with arithmetic expressions', () => {
    expect(
        render(dedent`
        <Heading 
            level={1 + 2}
            width={100 * 2}
            active={!false}
            comparison={5 > 3}
            concat={"hello " + "world"}
        />
        `),
    ).toMatchInlineSnapshot(`
      {
        "errors": [],
        "html": "<h1 width="200" concat="hello world"></h1>",
        "result": <React.Fragment>
          <Heading
            active={true}
            comparison={true}
            concat="hello world"
            level={3}
            width={200}
          />
        </React.Fragment>,
      }
    `)
})

test('jsx attributes with complex objects and arrays', () => {
    expect(
        render(dedent`
        <Heading 
            simpleArray={[1, 2, 3]}
            stringArray={["one", "two", "three"]}
            mixedArray={[1, "two", true, null]}
            simpleObject={{name: "John", age: 30}}
            nestedObject={{
                user: {
                    name: "Alice",
                    preferences: {
                        theme: "dark",
                        lang: "en"
                    }
                },
                settings: {
                    notifications: true,
                    emails: ["alice@example.com", "alice.work@example.com"]
                }
            }}
            arrayOfObjects={[
                {id: 1, name: "Item 1"},
                {id: 2, name: "Item 2"}
            ]}
        />
        `),
    ).toMatchInlineSnapshot(`
      {
        "errors": [],
        "html": "<h1 simpleArray="1,2,3" stringArray="one,two,three" mixedArray="1,two,true," simpleObject="[object Object]" nestedObject="[object Object]" arrayOfObjects="[object Object],[object Object]"></h1>",
        "result": <React.Fragment>
          <Heading
            arrayOfObjects={
              [
                {
                  "id": 1,
                  "name": "Item 1",
                },
                {
                  "id": 2,
                  "name": "Item 2",
                },
              ]
            }
            mixedArray={
              [
                1,
                "two",
                true,
                null,
              ]
            }
            nestedObject={
              {
                "settings": {
                  "emails": [
                    "alice@example.com",
                    "alice.work@example.com",
                  ],
                  "notifications": true,
                },
                "user": {
                  "name": "Alice",
                  "preferences": {
                    "lang": "en",
                    "theme": "dark",
                  },
                },
              }
            }
            simpleArray={
              [
                1,
                2,
                3,
              ]
            }
            simpleObject={
              {
                "age": 30,
                "name": "John",
              }
            }
            stringArray={
              [
                "one",
                "two",
                "three",
              ]
            }
          />
        </React.Fragment>,
      }
    `)
})

test('breaks', () => {
    expect(
        render(dedent`
        To have a line break without a paragraph, you will need to use two trailing spaces.
        Note that this line is separate, but within the same paragraph.
        (This is contrary to the typical GFM line break behaviour, where trailing spaces are not required.)
        `),
    ).toMatchInlineSnapshot(`
      {
        "errors": [],
        "html": "<p>To have a line break without a paragraph, you will need to use two trailing spaces.
      Note that this line is separate, but within the same paragraph.
      (This is contrary to the typical GFM line break behaviour, where trailing spaces are not required.)</p>",
        "result": <React.Fragment>
          <p>
            To have a line break without a paragraph, you will need to use two trailing spaces.
      Note that this line is separate, but within the same paragraph.
      (This is contrary to the typical GFM line break behaviour, where trailing spaces are not required.)
          </p>
        </React.Fragment>,
      }
    `)
})

// https://github.com/obedm503/markdown-kitchen-sink/blob/master/README.md?plain=1
test('kitchen sink', () => {
    expect(
        render(dedent`
        # Markdown Kitchen Sink
        This file is https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet plus a few fixes and additions. Used by [obedm503/bootmark](https://github.com/obedm503/bootmark) to [demonstrate](https://obedm503.github.io/bootmark/docs/markdown-cheatsheet.html) it's styling features.

        This is intended as a quick reference and showcase. For more complete info, see [John Gruber's original spec](http://daringfireball.net/projects/markdown/) and the [Github-flavored Markdown info page](http://github.github.com/github-flavored-markdown/).

        Note that there is also a [Cheatsheet specific to Markdown Here](./Markdown-Here-Cheatsheet) if that's what you're looking for. You can also check out [more Markdown tools](./Other-Markdown-Tools).

        ##### Table of Contents
        [Headers](#headers)
        [Emphasis](#emphasis)
        [Lists](#lists)
        [Links](#links)
        [Images](#images)
        [Code and Syntax Highlighting](#code)
        [Tables](#tables)
        [Blockquotes](#blockquotes)
        [Inline HTML](#html)
        [Horizontal Rule](#hr)
        [Line Breaks](#lines)
        [YouTube Videos](#videos)

        <a name="headers"></a>

        ## Headers


        # H1
        ## H2
        ### H3
        #### H4
        ##### H5
        ###### H6

        Alternatively, for H1 and H2, an underline-ish style:

        Alt-H1
        ======

        Alt-H2
        ------


        # H1
        ## H2
        ### H3
        #### H4
        ##### H5
        ###### H6

        Alternatively, for H1 and H2, an underline-ish style:

        Alt-H1
        ======

        Alt-H2
        ------

        <a name="emphasis"></a>

        ## Emphasis

        \`\`\`no-highlight
        Emphasis, aka italics, with *asterisks* or _underscores_.

        Strong emphasis, aka bold, with **asterisks** or __underscores__.

        Combined emphasis with **asterisks and _underscores_**.

        Strikethrough uses two tildes. ~~Scratch this.~~
        \`\`\`

        Emphasis, aka italics, with *asterisks* or _underscores_.

        Strong emphasis, aka bold, with **asterisks** or __underscores__.

        Combined emphasis with **asterisks and _underscores_**.

        Strikethrough uses two tildes. ~~Scratch this.~~


        <a name="lists"></a>

        ## Lists

        (In this example, leading and trailing spaces are shown with with dots: ⋅)

        \`\`\`no-highlight
        1. First ordered list item
        2. Another item
        ⋅⋅* Unordered sub-list.
        1. Actual numbers don't matter, just that it's a number
        ⋅⋅1. Ordered sub-list
        4. And another item.

        ⋅⋅⋅You can have properly indented paragraphs within list items. Notice the blank line above, and the leading spaces (at least one, but we'll use three here to also align the raw Markdown).

        ⋅⋅⋅To have a line break without a paragraph, you will need to use two trailing spaces.⋅⋅
        ⋅⋅⋅Note that this line is separate, but within the same paragraph.⋅⋅
        ⋅⋅⋅(This is contrary to the typical GFM line break behaviour, where trailing spaces are not required.)

        * Unordered list can use asterisks
        - Or minuses
        + Or pluses
        \`\`\`

        1. First ordered list item
        2. Another item
          * Unordered sub-list.
        1. Actual numbers don't matter, just that it's a number
          1. Ordered sub-list
        4. And another item.

           You can have properly indented paragraphs within list items. Notice the blank line above, and the leading spaces (at least one, but we'll use three here to also align the raw Markdown).

           To have a line break without a paragraph, you will need to use two trailing spaces.
           Note that this line is separate, but within the same paragraph.
           (This is contrary to the typical GFM line break behaviour, where trailing spaces are not required.)

        * Unordered list can use asterisks
        - Or minuses
        + Or pluses

        <a name="links"></a>

        ## Links

        There are two ways to create links.

        \`\`\`no-highlight
        [I'm an inline-style link](https://www.google.com)

        [I'm an inline-style link with title](https://www.google.com "Google's Homepage")

        [I'm a reference-style link][Arbitrary case-insensitive reference text]

        [I'm a relative reference to a repository file](../blob/master/LICENSE)

        [You can use numbers for reference-style link definitions][1]

        Or leave it empty and use the [link text itself].

        URLs and URLs in angle brackets will automatically get turned into links.
        http://www.example.com and sometimes
        example.com (but not on Github, for example).

        Some text to show that the reference links can follow later.

        [arbitrary case-insensitive reference text]: https://www.mozilla.org
        [1]: http://slashdot.org
        [link text itself]: http://www.reddit.com
        \`\`\`

        [I'm an inline-style link](https://www.google.com)

        [I'm an inline-style link with title](https://www.google.com "Google's Homepage")

        [I'm a reference-style link][Arbitrary case-insensitive reference text]

        [I'm a relative reference to a repository file](../blob/master/LICENSE)

        [You can use numbers for reference-style link definitions][1]

        Or leave it empty and use the [link text itself].

        URLs and URLs in angle brackets will automatically get turned into links.
        http://www.example.com and sometimes
        example.com (but not on Github, for example).

        Some text to show that the reference links can follow later.

        [arbitrary case-insensitive reference text]: https://www.mozilla.org
        [1]: http://slashdot.org
        [link text itself]: http://www.reddit.com

        <a name="images"></a>

        ## Images

        \`\`\`no-highlight
        Here's our logo (hover to see the title text):

        Inline-style:
        ![alt text](https://github.com/adam-p/markdown-here/raw/master/src/common/images/icon48.png "Logo Title Text 1")

        Reference-style:
        ![alt text][logo]

        [logo]: https://github.com/adam-p/markdown-here/raw/master/src/common/images/icon48.png "Logo Title Text 2"
        \`\`\`

        Here's our logo (hover to see the title text):

        Inline-style:
        ![alt text](https://github.com/adam-p/markdown-here/raw/master/src/common/images/icon48.png "Logo Title Text 1")

        Reference-style:
        ![alt text][logo]

        [logo]: https://github.com/adam-p/markdown-here/raw/master/src/common/images/icon48.png "Logo Title Text 2"

        <a name="code"></a>

        ## Code and Syntax Highlighting

        Code blocks are part of the Markdown spec, but syntax highlighting isn't. However, many renderers -- like Github's and *Markdown Here* -- support syntax highlighting. Which languages are supported and how those language names should be written will vary from renderer to renderer. *Markdown Here* supports highlighting for dozens of languages (and not-really-languages, like diffs and HTTP headers); to see the complete list, and how to write the language names, see the [highlight.js demo page](http://softwaremaniacs.org/media/soft/highlight/test.html).

        \`\`\`no-highlight
        Inline \`code\` has \`back-ticks around\` it.
        \`\`\`

        Inline \`code\` has \`back-ticks around\` it.

        Blocks of code are either fenced by lines with three back-ticks <code>\`\`\`</code>, or are indented with four spaces. I recommend only using the fenced code blocks -- they're easier and only they support syntax highlighting.

        \`\`\`javascript
        var s = "JavaScript syntax highlighting";
        alert(s);
        \`\`\`

        \`\`\`python
        s = "Python syntax highlighting"
        print s
        \`\`\`

        \`\`\`
        No language indicated, so no syntax highlighting.
        But let's throw in a &lt;b&gt;tag&lt;/b&gt;.
        \`\`\`




        \`\`\`javascript
        var s = "JavaScript syntax highlighting";
        alert(s);
        \`\`\`

        \`\`\`python
        s = "Python syntax highlighting"
        print s
        \`\`\`

        \`\`\`
        No language indicated, so no syntax highlighting in Markdown Here (varies on Github).
        But let's throw in a <b>tag</b>.
        \`\`\`


        <a name="tables"></a>

        ## Tables

        Tables aren't part of the core Markdown spec, but they are part of GFM and *Markdown Here* supports them. They are an easy way of adding tables to your email -- a task that would otherwise require copy-pasting from another application.

        \`\`\`no-highlight
        Colons can be used to align columns.

        | Tables        | Are           | Cool  |
        | ------------- |:-------------:| -----:|
        | col 3 is      | right-aligned | $1600 |
        | col 2 is      | centered      |   $12 |
        | zebra stripes | are neat      |    $1 |

        There must be at least 3 dashes separating each header cell.
        The outer pipes (|) are optional, and you don't need to make the
        raw Markdown line up prettily. You can also use inline Markdown.

        Markdown | Less | Pretty
        --- | --- | ---
        *Still* | \`renders\` | **nicely**
        1 | 2 | 3
        \`\`\`

        Colons can be used to align columns.

        | Tables        | Are           | Cool |
        | ------------- |:-------------:| -----:|
        | col 3 is      | right-aligned | $1600 |
        | col 2 is      | centered      |   $12 |
        | zebra stripes | are neat      |    $1 |

        There must be at least 3 dashes separating each header cell. The outer pipes (|) are optional, and you don't need to make the raw Markdown line up prettily. You can also use inline Markdown.

        Markdown | Less | Pretty
        --- | --- | ---
        *Still* | \`renders\` | **nicely**
        1 | 2 | 3

        <a name="blockquotes"></a>

        ## Blockquotes

        \`\`\`no-highlight
        > Blockquotes are very handy in email to emulate reply text.
        > This line is part of the same quote.

        Quote break.

        > This is a very long line that will still be quoted properly when it wraps. Oh boy let's keep writing to make sure this is long enough to actually wrap for everyone. Oh, you can *put* **Markdown** into a blockquote.
        \`\`\`

        > Blockquotes are very handy in email to emulate reply text.
        > This line is part of the same quote.

        Quote break.

        > This is a very long line that will still be quoted properly when it wraps. Oh boy let's keep writing to make sure this is long enough to actually wrap for everyone. Oh, you can *put* **Markdown** into a blockquote.

        <a name="html"></a>

        ## Inline HTML

        You can also use raw HTML in your Markdown, and it'll mostly work pretty well.

        \`\`\`no-highlight
        <dl>
          <dt>Definition list</dt>
          <dd>Is something people use sometimes.</dd>

          <dt>Markdown in HTML</dt>
          <dd>Does *not* work **very** well. Use HTML <em>tags</em>.</dd>
        </dl>
        \`\`\`

        <dl>
          <dt>Definition list</dt>
          <dd>Is something people use sometimes.</dd>

          <dt>Markdown in HTML</dt>
          <dd>Does *not* work **very** well. Use HTML <em>tags</em>.</dd>
        </dl>

        <a name="hr"></a>

        ## Horizontal Rule

        \`\`\`
        Three or more...

        ---

        Hyphens

        ***

        Asterisks

        ___

        Underscores
        \`\`\`

        Three or more...

        ---

        Hyphens

        ***

        Asterisks

        ___

        Underscores

        <a name="lines"></a>

        ## Line Breaks

        My basic recommendation for learning how line breaks work is to experiment and discover -- hit &lt;Enter&gt; once (i.e., insert one newline), then hit it twice (i.e., insert two newlines), see what happens. You'll soon learn to get what you want. "Markdown Toggle" is your friend.

        Here are some things to try out:

        \`\`\`
        Here's a line for us to start with.

        This line is separated from the one above by two newlines, so it will be a *separate paragraph*.

        This line is also a separate paragraph, but...
        This line is only separated by a single newline, so it's a separate line in the *same paragraph*.
        \`\`\`

        Here's a line for us to start with.

        This line is separated from the one above by two newlines, so it will be a *separate paragraph*.

        This line is also begins a separate paragraph, but...
        This line is only separated by a single newline, so it's a separate line in the *same paragraph*.

        (Technical note: *Markdown Here* uses GFM line breaks, so there's no need to use MD's two-space line breaks.)

        <a name="videos"></a>

        ## YouTube Videos

        They can't be added directly but you can add an image with a link to the video like this:

        \`\`\`no-highlight
        <a href="http://www.youtube.com/watch?feature=player_embedded&v=YOUTUBE_VIDEO_ID_HERE
        " target="_blank"><img src="http://img.youtube.com/vi/YOUTUBE_VIDEO_ID_HERE/0.jpg"
        alt="IMAGE ALT TEXT HERE" width="240" height="180" border="10" /></a>
        \`\`\`

        Or, in pure Markdown, but losing the image sizing and border:

        \`\`\`no-highlight
        [![IMAGE ALT TEXT HERE](http://img.youtube.com/vi/YOUTUBE_VIDEO_ID_HERE/0.jpg)](http://www.youtube.com/watch?v=YOUTUBE_VIDEO_ID_HERE)
        \`\`\`

        `),
    ).toMatchInlineSnapshot(`
      {
        "errors": [],
        "html": "<link rel="preload" as="image" href="https://github.com/adam-p/markdown-here/raw/master/src/common/images/icon48.png"/><h1>Markdown Kitchen Sink</h1><p>This file is <a href="https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet" title="">https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet</a> plus a few fixes and additions. Used by <a href="https://github.com/obedm503/bootmark" title="">obedm503/bootmark</a> to <a href="https://obedm503.github.io/bootmark/docs/markdown-cheatsheet.html" title="">demonstrate</a> it&#x27;s styling features.</p><p>This is intended as a quick reference and showcase. For more complete info, see <a href="http://daringfireball.net/projects/markdown/" title="">John Gruber&#x27;s original spec</a> and the <a href="http://github.github.com/github-flavored-markdown/" title="">Github-flavored Markdown info page</a>.</p><p>Note that there is also a <a href="./Markdown-Here-Cheatsheet" title="">Cheatsheet specific to Markdown Here</a> if that&#x27;s what you&#x27;re looking for. You can also check out <a href="./Other-Markdown-Tools" title="">more Markdown tools</a>.</p><h5>Table of Contents</h5><p><a href="#headers" title="">Headers</a>
      <a href="#emphasis" title="">Emphasis</a>
      <a href="#lists" title="">Lists</a>
      <a href="#links" title="">Links</a>
      <a href="#images" title="">Images</a>
      <a href="#code" title="">Code and Syntax Highlighting</a>
      <a href="#tables" title="">Tables</a>
      <a href="#blockquotes" title="">Blockquotes</a>
      <a href="#html" title="">Inline HTML</a>
      <a href="#hr" title="">Horizontal Rule</a>
      <a href="#lines" title="">Line Breaks</a>
      <a href="#videos" title="">YouTube Videos</a></p><a name="headers"></a><h2>Headers</h2><h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><h5>H5</h5><h6>H6</h6><p>Alternatively, for H1 and H2, an underline-ish style:</p><h1>Alt-H1</h1><h2>Alt-H2</h2><h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><h5>H5</h5><h6>H6</h6><p>Alternatively, for H1 and H2, an underline-ish style:</p><h1>Alt-H1</h1><h2>Alt-H2</h2><a name="emphasis"></a><h2>Emphasis</h2><pre><code class="language-no-highlight">Emphasis, aka italics, with *asterisks* or _underscores_.

      Strong emphasis, aka bold, with **asterisks** or __underscores__.

      Combined emphasis with **asterisks and _underscores_**.

      Strikethrough uses two tildes. ~~Scratch this.~~</code></pre><p>Emphasis, aka italics, with <em>asterisks</em> or <em>underscores</em>.</p><p>Strong emphasis, aka bold, with <strong>asterisks</strong> or <strong>underscores</strong>.</p><p>Combined emphasis with <strong>asterisks and <em>underscores</em></strong>.</p><p>Strikethrough uses two tildes. <del>Scratch this.</del></p><a name="lists"></a><h2>Lists</h2><p>(In this example, leading and trailing spaces are shown with with dots: ⋅)</p><pre><code class="language-no-highlight">1. First ordered list item
      2. Another item
      ⋅⋅* Unordered sub-list.
      1. Actual numbers don&#x27;t matter, just that it&#x27;s a number
      ⋅⋅1. Ordered sub-list
      4. And another item.

      ⋅⋅⋅You can have properly indented paragraphs within list items. Notice the blank line above, and the leading spaces (at least one, but we&#x27;ll use three here to also align the raw Markdown).

      ⋅⋅⋅To have a line break without a paragraph, you will need to use two trailing spaces.⋅⋅
      ⋅⋅⋅Note that this line is separate, but within the same paragraph.⋅⋅
      ⋅⋅⋅(This is contrary to the typical GFM line break behaviour, where trailing spaces are not required.)

      * Unordered list can use asterisks
      - Or minuses
      + Or pluses</code></pre><ol start="1"><li><p>First ordered list item</p></li><li><p>Another item</p></li></ol><ul><li><p>Unordered sub-list.</p></li></ul><ol start="1"><li><p>Actual numbers don&#x27;t matter, just that it&#x27;s a number</p></li><li><p>Ordered sub-list</p></li><li><p>And another item.</p><p>You can have properly indented paragraphs within list items. Notice the blank line above, and the leading spaces (at least one, but we&#x27;ll use three here to also align the raw Markdown).</p><p>To have a line break without a paragraph, you will need to use two trailing spaces.
      Note that this line is separate, but within the same paragraph.
      (This is contrary to the typical GFM line break behaviour, where trailing spaces are not required.)</p></li></ol><ul><li><p>Unordered list can use asterisks</p></li></ul><ul><li><p>Or minuses</p></li></ul><ul><li><p>Or pluses</p></li></ul><a name="links"></a><h2>Links</h2><p>There are two ways to create links.</p><pre><code class="language-no-highlight">[I&#x27;m an inline-style link](https://www.google.com)

      [I&#x27;m an inline-style link with title](https://www.google.com &quot;Google&#x27;s Homepage&quot;)

      [I&#x27;m a reference-style link][Arbitrary case-insensitive reference text]

      [I&#x27;m a relative reference to a repository file](../blob/master/LICENSE)

      [You can use numbers for reference-style link definitions][1]

      Or leave it empty and use the [link text itself].

      URLs and URLs in angle brackets will automatically get turned into links.
      http://www.example.com and sometimes
      example.com (but not on Github, for example).

      Some text to show that the reference links can follow later.

      [arbitrary case-insensitive reference text]: https://www.mozilla.org
      [1]: http://slashdot.org
      [link text itself]: http://www.reddit.com</code></pre><p><a href="https://www.google.com" title="">I&#x27;m an inline-style link</a></p><p><a href="https://www.google.com" title="Google&#x27;s Homepage">I&#x27;m an inline-style link with title</a></p><p><a href="https://www.mozilla.org" title="">I&#x27;m a reference-style link</a></p><p><a href="../blob/master/LICENSE" title="">I&#x27;m a relative reference to a repository file</a></p><p><a href="http://slashdot.org" title="">You can use numbers for reference-style link definitions</a></p><p>Or leave it empty and use the <a href="http://www.reddit.com" title="">link text itself</a>.</p><p>URLs and URLs in angle brackets will automatically get turned into links.
      <a href="http://www.example.com" title="">http://www.example.com</a> and sometimes
      example.com (but not on Github, for example).</p><p>Some text to show that the reference links can follow later.</p><a name="images"></a><h2>Images</h2><pre><code class="language-no-highlight">Here&#x27;s our logo (hover to see the title text):

      Inline-style:
      ![alt text](https://github.com/adam-p/markdown-here/raw/master/src/common/images/icon48.png &quot;Logo Title Text 1&quot;)

      Reference-style:
      ![alt text][logo]

      [logo]: https://github.com/adam-p/markdown-here/raw/master/src/common/images/icon48.png &quot;Logo Title Text 2&quot;</code></pre><p>Here&#x27;s our logo (hover to see the title text):</p><p>Inline-style:
      <img src="https://github.com/adam-p/markdown-here/raw/master/src/common/images/icon48.png" alt="alt text" title="Logo Title Text 1"/></p><p>Reference-style:
      </p><a name="code"></a><h2>Code and Syntax Highlighting</h2><p>Code blocks are part of the Markdown spec, but syntax highlighting isn&#x27;t. However, many renderers -- like Github&#x27;s and <em>Markdown Here</em> -- support syntax highlighting. Which languages are supported and how those language names should be written will vary from renderer to renderer. <em>Markdown Here</em> supports highlighting for dozens of languages (and not-really-languages, like diffs and HTTP headers); to see the complete list, and how to write the language names, see the <a href="http://softwaremaniacs.org/media/soft/highlight/test.html" title="">highlight.js demo page</a>.</p><pre><code class="language-no-highlight">Inline \`code\` has \`back-ticks around\` it.</code></pre><p>Inline <code>code</code> has <code>back-ticks around</code> it.</p><p>Blocks of code are either fenced by lines with three back-ticks <code>\`\`\`</code>, or are indented with four spaces. I recommend only using the fenced code blocks -- they&#x27;re easier and only they support syntax highlighting.</p><pre><code class="language-javascript">var s = &quot;JavaScript syntax highlighting&quot;;
      alert(s);</code></pre><pre><code class="language-python">s = &quot;Python syntax highlighting&quot;
      print s</code></pre><pre><code>No language indicated, so no syntax highlighting.
      But let&#x27;s throw in a &amp;lt;b&amp;gt;tag&amp;lt;/b&amp;gt;.</code></pre><pre><code class="language-javascript">var s = &quot;JavaScript syntax highlighting&quot;;
      alert(s);</code></pre><pre><code class="language-python">s = &quot;Python syntax highlighting&quot;
      print s</code></pre><pre><code>No language indicated, so no syntax highlighting in Markdown Here (varies on Github).
      But let&#x27;s throw in a &lt;b&gt;tag&lt;/b&gt;.</code></pre><a name="tables"></a><h2>Tables</h2><p>Tables aren&#x27;t part of the core Markdown spec, but they are part of GFM and <em>Markdown Here</em> supports them. They are an easy way of adding tables to your email -- a task that would otherwise require copy-pasting from another application.</p><pre><code class="language-no-highlight">Colons can be used to align columns.

      | Tables        | Are           | Cool  |
      | ------------- |:-------------:| -----:|
      | col 3 is      | right-aligned | $1600 |
      | col 2 is      | centered      |   $12 |
      | zebra stripes | are neat      |    $1 |

      There must be at least 3 dashes separating each header cell.
      The outer pipes (|) are optional, and you don&#x27;t need to make the
      raw Markdown line up prettily. You can also use inline Markdown.

      Markdown | Less | Pretty
      --- | --- | ---
      *Still* | \`renders\` | **nicely**
      1 | 2 | 3</code></pre><p>Colons can be used to align columns.</p><table><thead><tr class=""><td class="">Tables</td><td class="">Are</td><td class="">Cool</td></tr></thead><tbody><tr class=""><td class="">col 3 is</td><td class="">right-aligned</td><td class="">$1600</td></tr><tr class=""><td class="">col 2 is</td><td class="">centered</td><td class="">$12</td></tr><tr class=""><td class="">zebra stripes</td><td class="">are neat</td><td class="">$1</td></tr></tbody></table><p>There must be at least 3 dashes separating each header cell. The outer pipes (|) are optional, and you don&#x27;t need to make the raw Markdown line up prettily. You can also use inline Markdown.</p><table><thead><tr class=""><td class="">Markdown</td><td class="">Less</td><td class="">Pretty</td></tr></thead><tbody><tr class=""><td class=""><em>Still</em></td><td class=""><code>renders</code></td><td class=""><strong>nicely</strong></td></tr><tr class=""><td class="">1</td><td class="">2</td><td class="">3</td></tr></tbody></table><a name="blockquotes"></a><h2>Blockquotes</h2><pre><code class="language-no-highlight">&gt; Blockquotes are very handy in email to emulate reply text.
      &gt; This line is part of the same quote.

      Quote break.

      &gt; This is a very long line that will still be quoted properly when it wraps. Oh boy let&#x27;s keep writing to make sure this is long enough to actually wrap for everyone. Oh, you can *put* **Markdown** into a blockquote.</code></pre><blockquote><p>Blockquotes are very handy in email to emulate reply text.
      This line is part of the same quote.</p></blockquote><p>Quote break.</p><blockquote><p>This is a very long line that will still be quoted properly when it wraps. Oh boy let&#x27;s keep writing to make sure this is long enough to actually wrap for everyone. Oh, you can <em>put</em> <strong>Markdown</strong> into a blockquote.</p></blockquote><a name="html"></a><h2>Inline HTML</h2><p>You can also use raw HTML in your Markdown, and it&#x27;ll mostly work pretty well.</p><pre><code class="language-no-highlight">&lt;dl&gt;
        &lt;dt&gt;Definition list&lt;/dt&gt;
        &lt;dd&gt;Is something people use sometimes.&lt;/dd&gt;

        &lt;dt&gt;Markdown in HTML&lt;/dt&gt;
        &lt;dd&gt;Does *not* work **very** well. Use HTML &lt;em&gt;tags&lt;/em&gt;.&lt;/dd&gt;
      &lt;/dl&gt;</code></pre><dl><dt>Definition list</dt><dd>Is something people use sometimes.</dd><dt>Markdown in HTML</dt><dd>Does <em>not</em> work <strong>very</strong> well. Use HTML <em>tags</em>.</dd></dl><a name="hr"></a><h2>Horizontal Rule</h2><pre><code>Three or more...

      ---

      Hyphens

      ***

      Asterisks

      ___

      Underscores</code></pre><p>Three or more...</p><hr/><p>Hyphens</p><hr/><p>Asterisks</p><hr/><p>Underscores</p><a name="lines"></a><h2>Line Breaks</h2><p>My basic recommendation for learning how line breaks work is to experiment and discover -- hit &lt;Enter&gt; once (i.e., insert one newline), then hit it twice (i.e., insert two newlines), see what happens. You&#x27;ll soon learn to get what you want. &quot;Markdown Toggle&quot; is your friend.</p><p>Here are some things to try out:</p><pre><code>Here&#x27;s a line for us to start with.

      This line is separated from the one above by two newlines, so it will be a *separate paragraph*.

      This line is also a separate paragraph, but...
      This line is only separated by a single newline, so it&#x27;s a separate line in the *same paragraph*.</code></pre><p>Here&#x27;s a line for us to start with.</p><p>This line is separated from the one above by two newlines, so it will be a <em>separate paragraph</em>.</p><p>This line is also begins a separate paragraph, but...
      This line is only separated by a single newline, so it&#x27;s a separate line in the <em>same paragraph</em>.</p><p>(Technical note: <em>Markdown Here</em> uses GFM line breaks, so there&#x27;s no need to use MD&#x27;s two-space line breaks.)</p><a name="videos"></a><h2>YouTube Videos</h2><p>They can&#x27;t be added directly but you can add an image with a link to the video like this:</p><pre><code class="language-no-highlight">&lt;a href=&quot;http://www.youtube.com/watch?feature=player_embedded&amp;v=YOUTUBE_VIDEO_ID_HERE
      &quot; target=&quot;_blank&quot;&gt;&lt;img src=&quot;http://img.youtube.com/vi/YOUTUBE_VIDEO_ID_HERE/0.jpg&quot;
      alt=&quot;IMAGE ALT TEXT HERE&quot; width=&quot;240&quot; height=&quot;180&quot; border=&quot;10&quot; /&gt;&lt;/a&gt;</code></pre><p>Or, in pure Markdown, but losing the image sizing and border:</p><pre><code class="language-no-highlight">[![IMAGE ALT TEXT HERE](http://img.youtube.com/vi/YOUTUBE_VIDEO_ID_HERE/0.jpg)](http://www.youtube.com/watch?v=YOUTUBE_VIDEO_ID_HERE)</code></pre>",
        "result": <React.Fragment>
          <h1>
            Markdown Kitchen Sink
          </h1>
          <p>
            This file is 
            <a
              href="https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet"
              title=""
            >
              https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet
            </a>
             plus a few fixes and additions. Used by 
            <a
              href="https://github.com/obedm503/bootmark"
              title=""
            >
              obedm503/bootmark
            </a>
             to 
            <a
              href="https://obedm503.github.io/bootmark/docs/markdown-cheatsheet.html"
              title=""
            >
              demonstrate
            </a>
             it's styling features.
          </p>
          <p>
            This is intended as a quick reference and showcase. For more complete info, see 
            <a
              href="http://daringfireball.net/projects/markdown/"
              title=""
            >
              John Gruber's original spec
            </a>
             and the 
            <a
              href="http://github.github.com/github-flavored-markdown/"
              title=""
            >
              Github-flavored Markdown info page
            </a>
            .
          </p>
          <p>
            Note that there is also a 
            <a
              href="./Markdown-Here-Cheatsheet"
              title=""
            >
              Cheatsheet specific to Markdown Here
            </a>
             if that's what you're looking for. You can also check out 
            <a
              href="./Other-Markdown-Tools"
              title=""
            >
              more Markdown tools
            </a>
            .
          </p>
          <h5>
            Table of Contents
          </h5>
          <p>
            <a
              href="#headers"
              title=""
            >
              Headers
            </a>
            

            <a
              href="#emphasis"
              title=""
            >
              Emphasis
            </a>
            

            <a
              href="#lists"
              title=""
            >
              Lists
            </a>
            

            <a
              href="#links"
              title=""
            >
              Links
            </a>
            

            <a
              href="#images"
              title=""
            >
              Images
            </a>
            

            <a
              href="#code"
              title=""
            >
              Code and Syntax Highlighting
            </a>
            

            <a
              href="#tables"
              title=""
            >
              Tables
            </a>
            

            <a
              href="#blockquotes"
              title=""
            >
              Blockquotes
            </a>
            

            <a
              href="#html"
              title=""
            >
              Inline HTML
            </a>
            

            <a
              href="#hr"
              title=""
            >
              Horizontal Rule
            </a>
            

            <a
              href="#lines"
              title=""
            >
              Line Breaks
            </a>
            

            <a
              href="#videos"
              title=""
            >
              YouTube Videos
            </a>
          </p>
          <a
            name="headers"
          />
          <h2>
            Headers
          </h2>
          <h1>
            H1
          </h1>
          <h2>
            H2
          </h2>
          <h3>
            H3
          </h3>
          <h4>
            H4
          </h4>
          <h5>
            H5
          </h5>
          <h6>
            H6
          </h6>
          <p>
            Alternatively, for H1 and H2, an underline-ish style:
          </p>
          <h1>
            Alt-H1
          </h1>
          <h2>
            Alt-H2
          </h2>
          <h1>
            H1
          </h1>
          <h2>
            H2
          </h2>
          <h3>
            H3
          </h3>
          <h4>
            H4
          </h4>
          <h5>
            H5
          </h5>
          <h6>
            H6
          </h6>
          <p>
            Alternatively, for H1 and H2, an underline-ish style:
          </p>
          <h1>
            Alt-H1
          </h1>
          <h2>
            Alt-H2
          </h2>
          <a
            name="emphasis"
          />
          <h2>
            Emphasis
          </h2>
          <pre>
            <code
              className="language-no-highlight"
            >
              Emphasis, aka italics, with *asterisks* or _underscores_.

      Strong emphasis, aka bold, with **asterisks** or __underscores__.

      Combined emphasis with **asterisks and _underscores_**.

      Strikethrough uses two tildes. ~~Scratch this.~~
            </code>
          </pre>
          <p>
            Emphasis, aka italics, with 
            <em>
              asterisks
            </em>
             or 
            <em>
              underscores
            </em>
            .
          </p>
          <p>
            Strong emphasis, aka bold, with 
            <strong>
              asterisks
            </strong>
             or 
            <strong>
              underscores
            </strong>
            .
          </p>
          <p>
            Combined emphasis with 
            <strong>
              asterisks and 
              <em>
                underscores
              </em>
            </strong>
            .
          </p>
          <p>
            Strikethrough uses two tildes. 
            <del>
              Scratch this.
            </del>
          </p>
          <a
            name="lists"
          />
          <h2>
            Lists
          </h2>
          <p>
            (In this example, leading and trailing spaces are shown with with dots: ⋅)
          </p>
          <pre>
            <code
              className="language-no-highlight"
            >
              1. First ordered list item
      2. Another item
      ⋅⋅* Unordered sub-list.
      1. Actual numbers don't matter, just that it's a number
      ⋅⋅1. Ordered sub-list
      4. And another item.

      ⋅⋅⋅You can have properly indented paragraphs within list items. Notice the blank line above, and the leading spaces (at least one, but we'll use three here to also align the raw Markdown).

      ⋅⋅⋅To have a line break without a paragraph, you will need to use two trailing spaces.⋅⋅
      ⋅⋅⋅Note that this line is separate, but within the same paragraph.⋅⋅
      ⋅⋅⋅(This is contrary to the typical GFM line break behaviour, where trailing spaces are not required.)

      * Unordered list can use asterisks
      - Or minuses
      + Or pluses
            </code>
          </pre>
          <ol
            start={1}
          >
            <li>
              <p>
                First ordered list item
              </p>
            </li>
            <li>
              <p>
                Another item
              </p>
            </li>
          </ol>
          <ul>
            <li>
              <p>
                Unordered sub-list.
              </p>
            </li>
          </ul>
          <ol
            start={1}
          >
            <li>
              <p>
                Actual numbers don't matter, just that it's a number
              </p>
            </li>
            <li>
              <p>
                Ordered sub-list
              </p>
            </li>
            <li>
              <p>
                And another item.
              </p>
              <p>
                You can have properly indented paragraphs within list items. Notice the blank line above, and the leading spaces (at least one, but we'll use three here to also align the raw Markdown).
              </p>
              <p>
                To have a line break without a paragraph, you will need to use two trailing spaces.
      Note that this line is separate, but within the same paragraph.
      (This is contrary to the typical GFM line break behaviour, where trailing spaces are not required.)
              </p>
            </li>
          </ol>
          <ul>
            <li>
              <p>
                Unordered list can use asterisks
              </p>
            </li>
          </ul>
          <ul>
            <li>
              <p>
                Or minuses
              </p>
            </li>
          </ul>
          <ul>
            <li>
              <p>
                Or pluses
              </p>
            </li>
          </ul>
          <a
            name="links"
          />
          <h2>
            Links
          </h2>
          <p>
            There are two ways to create links.
          </p>
          <pre>
            <code
              className="language-no-highlight"
            >
              [I'm an inline-style link](https://www.google.com)

      [I'm an inline-style link with title](https://www.google.com "Google's Homepage")

      [I'm a reference-style link][Arbitrary case-insensitive reference text]

      [I'm a relative reference to a repository file](../blob/master/LICENSE)

      [You can use numbers for reference-style link definitions][1]

      Or leave it empty and use the [link text itself].

      URLs and URLs in angle brackets will automatically get turned into links.
      http://www.example.com and sometimes
      example.com (but not on Github, for example).

      Some text to show that the reference links can follow later.

      [arbitrary case-insensitive reference text]: https://www.mozilla.org
      [1]: http://slashdot.org
      [link text itself]: http://www.reddit.com
            </code>
          </pre>
          <p>
            <a
              href="https://www.google.com"
              title=""
            >
              I'm an inline-style link
            </a>
          </p>
          <p>
            <a
              href="https://www.google.com"
              title="Google's Homepage"
            >
              I'm an inline-style link with title
            </a>
          </p>
          <p>
            <a
              href="https://www.mozilla.org"
              title=""
            >
              I'm a reference-style link
            </a>
          </p>
          <p>
            <a
              href="../blob/master/LICENSE"
              title=""
            >
              I'm a relative reference to a repository file
            </a>
          </p>
          <p>
            <a
              href="http://slashdot.org"
              title=""
            >
              You can use numbers for reference-style link definitions
            </a>
          </p>
          <p>
            Or leave it empty and use the 
            <a
              href="http://www.reddit.com"
              title=""
            >
              link text itself
            </a>
            .
          </p>
          <p>
            URLs and URLs in angle brackets will automatically get turned into links.

            <a
              href="http://www.example.com"
              title=""
            >
              http://www.example.com
            </a>
             and sometimes
      example.com (but not on Github, for example).
          </p>
          <p>
            Some text to show that the reference links can follow later.
          </p>
          <a
            name="images"
          />
          <h2>
            Images
          </h2>
          <pre>
            <code
              className="language-no-highlight"
            >
              Here's our logo (hover to see the title text):

      Inline-style:
      ![alt text](https://github.com/adam-p/markdown-here/raw/master/src/common/images/icon48.png "Logo Title Text 1")

      Reference-style:
      ![alt text][logo]

      [logo]: https://github.com/adam-p/markdown-here/raw/master/src/common/images/icon48.png "Logo Title Text 2"
            </code>
          </pre>
          <p>
            Here's our logo (hover to see the title text):
          </p>
          <p>
            Inline-style:

            <img
              alt="alt text"
              src="https://github.com/adam-p/markdown-here/raw/master/src/common/images/icon48.png"
              title="Logo Title Text 1"
            />
          </p>
          <p>
            Reference-style:

          </p>
          <a
            name="code"
          />
          <h2>
            Code and Syntax Highlighting
          </h2>
          <p>
            Code blocks are part of the Markdown spec, but syntax highlighting isn't. However, many renderers -- like Github's and 
            <em>
              Markdown Here
            </em>
             -- support syntax highlighting. Which languages are supported and how those language names should be written will vary from renderer to renderer. 
            <em>
              Markdown Here
            </em>
             supports highlighting for dozens of languages (and not-really-languages, like diffs and HTTP headers); to see the complete list, and how to write the language names, see the 
            <a
              href="http://softwaremaniacs.org/media/soft/highlight/test.html"
              title=""
            >
              highlight.js demo page
            </a>
            .
          </p>
          <pre>
            <code
              className="language-no-highlight"
            >
              Inline \`code\` has \`back-ticks around\` it.
            </code>
          </pre>
          <p>
            Inline 
            <code>
              code
            </code>
             has 
            <code>
              back-ticks around
            </code>
             it.
          </p>
          <p>
            Blocks of code are either fenced by lines with three back-ticks 
            <code>
              \`\`\`
            </code>
            , or are indented with four spaces. I recommend only using the fenced code blocks -- they're easier and only they support syntax highlighting.
          </p>
          <pre>
            <code
              className="language-javascript"
            >
              var s = "JavaScript syntax highlighting";
      alert(s);
            </code>
          </pre>
          <pre>
            <code
              className="language-python"
            >
              s = "Python syntax highlighting"
      print s
            </code>
          </pre>
          <pre>
            <code>
              No language indicated, so no syntax highlighting.
      But let's throw in a &lt;b&gt;tag&lt;/b&gt;.
            </code>
          </pre>
          <pre>
            <code
              className="language-javascript"
            >
              var s = "JavaScript syntax highlighting";
      alert(s);
            </code>
          </pre>
          <pre>
            <code
              className="language-python"
            >
              s = "Python syntax highlighting"
      print s
            </code>
          </pre>
          <pre>
            <code>
              No language indicated, so no syntax highlighting in Markdown Here (varies on Github).
      But let's throw in a &lt;b&gt;tag&lt;/b&gt;.
            </code>
          </pre>
          <a
            name="tables"
          />
          <h2>
            Tables
          </h2>
          <p>
            Tables aren't part of the core Markdown spec, but they are part of GFM and 
            <em>
              Markdown Here
            </em>
             supports them. They are an easy way of adding tables to your email -- a task that would otherwise require copy-pasting from another application.
          </p>
          <pre>
            <code
              className="language-no-highlight"
            >
              Colons can be used to align columns.

      | Tables        | Are           | Cool  |
      | ------------- |:-------------:| -----:|
      | col 3 is      | right-aligned | $1600 |
      | col 2 is      | centered      |   $12 |
      | zebra stripes | are neat      |    $1 |

      There must be at least 3 dashes separating each header cell.
      The outer pipes (|) are optional, and you don't need to make the
      raw Markdown line up prettily. You can also use inline Markdown.

      Markdown | Less | Pretty
      --- | --- | ---
      *Still* | \`renders\` | **nicely**
      1 | 2 | 3
            </code>
          </pre>
          <p>
            Colons can be used to align columns.
          </p>
          <table>
            <thead>
              <tr
                className=""
              >
                <td
                  className=""
                >
                  Tables
                </td>
                <td
                  className=""
                >
                  Are
                </td>
                <td
                  className=""
                >
                  Cool
                </td>
              </tr>
            </thead>
            <tbody>
              <tr
                className=""
              >
                <td
                  className=""
                >
                  col 3 is
                </td>
                <td
                  className=""
                >
                  right-aligned
                </td>
                <td
                  className=""
                >
                  $1600
                </td>
              </tr>
              <tr
                className=""
              >
                <td
                  className=""
                >
                  col 2 is
                </td>
                <td
                  className=""
                >
                  centered
                </td>
                <td
                  className=""
                >
                  $12
                </td>
              </tr>
              <tr
                className=""
              >
                <td
                  className=""
                >
                  zebra stripes
                </td>
                <td
                  className=""
                >
                  are neat
                </td>
                <td
                  className=""
                >
                  $1
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            There must be at least 3 dashes separating each header cell. The outer pipes (|) are optional, and you don't need to make the raw Markdown line up prettily. You can also use inline Markdown.
          </p>
          <table>
            <thead>
              <tr
                className=""
              >
                <td
                  className=""
                >
                  Markdown
                </td>
                <td
                  className=""
                >
                  Less
                </td>
                <td
                  className=""
                >
                  Pretty
                </td>
              </tr>
            </thead>
            <tbody>
              <tr
                className=""
              >
                <td
                  className=""
                >
                  <em>
                    Still
                  </em>
                </td>
                <td
                  className=""
                >
                  <code>
                    renders
                  </code>
                </td>
                <td
                  className=""
                >
                  <strong>
                    nicely
                  </strong>
                </td>
              </tr>
              <tr
                className=""
              >
                <td
                  className=""
                >
                  1
                </td>
                <td
                  className=""
                >
                  2
                </td>
                <td
                  className=""
                >
                  3
                </td>
              </tr>
            </tbody>
          </table>
          <a
            name="blockquotes"
          />
          <h2>
            Blockquotes
          </h2>
          <pre>
            <code
              className="language-no-highlight"
            >
              &gt; Blockquotes are very handy in email to emulate reply text.
      &gt; This line is part of the same quote.

      Quote break.

      &gt; This is a very long line that will still be quoted properly when it wraps. Oh boy let's keep writing to make sure this is long enough to actually wrap for everyone. Oh, you can *put* **Markdown** into a blockquote.
            </code>
          </pre>
          <blockquote>
            <p>
              Blockquotes are very handy in email to emulate reply text.
      This line is part of the same quote.
            </p>
          </blockquote>
          <p>
            Quote break.
          </p>
          <blockquote>
            <p>
              This is a very long line that will still be quoted properly when it wraps. Oh boy let's keep writing to make sure this is long enough to actually wrap for everyone. Oh, you can 
              <em>
                put
              </em>
               
              <strong>
                Markdown
              </strong>
               into a blockquote.
            </p>
          </blockquote>
          <a
            name="html"
          />
          <h2>
            Inline HTML
          </h2>
          <p>
            You can also use raw HTML in your Markdown, and it'll mostly work pretty well.
          </p>
          <pre>
            <code
              className="language-no-highlight"
            >
              &lt;dl&gt;
        &lt;dt&gt;Definition list&lt;/dt&gt;
        &lt;dd&gt;Is something people use sometimes.&lt;/dd&gt;

        &lt;dt&gt;Markdown in HTML&lt;/dt&gt;
        &lt;dd&gt;Does *not* work **very** well. Use HTML &lt;em&gt;tags&lt;/em&gt;.&lt;/dd&gt;
      &lt;/dl&gt;
            </code>
          </pre>
          <dl>
            <dt>
              Definition list
            </dt>
            <dd>
              Is something people use sometimes.
            </dd>
            <dt>
              Markdown in HTML
            </dt>
            <dd>
              Does 
              <em>
                not
              </em>
               work 
              <strong>
                very
              </strong>
               well. Use HTML 
              <em>
                tags
              </em>
              .
            </dd>
          </dl>
          <a
            name="hr"
          />
          <h2>
            Horizontal Rule
          </h2>
          <pre>
            <code>
              Three or more...

      ---

      Hyphens

      ***

      Asterisks

      ___

      Underscores
            </code>
          </pre>
          <p>
            Three or more...
          </p>
          <hr />
          <p>
            Hyphens
          </p>
          <hr />
          <p>
            Asterisks
          </p>
          <hr />
          <p>
            Underscores
          </p>
          <a
            name="lines"
          />
          <h2>
            Line Breaks
          </h2>
          <p>
            My basic recommendation for learning how line breaks work is to experiment and discover -- hit &lt;Enter&gt; once (i.e., insert one newline), then hit it twice (i.e., insert two newlines), see what happens. You'll soon learn to get what you want. "Markdown Toggle" is your friend.
          </p>
          <p>
            Here are some things to try out:
          </p>
          <pre>
            <code>
              Here's a line for us to start with.

      This line is separated from the one above by two newlines, so it will be a *separate paragraph*.

      This line is also a separate paragraph, but...
      This line is only separated by a single newline, so it's a separate line in the *same paragraph*.
            </code>
          </pre>
          <p>
            Here's a line for us to start with.
          </p>
          <p>
            This line is separated from the one above by two newlines, so it will be a 
            <em>
              separate paragraph
            </em>
            .
          </p>
          <p>
            This line is also begins a separate paragraph, but...
      This line is only separated by a single newline, so it's a separate line in the 
            <em>
              same paragraph
            </em>
            .
          </p>
          <p>
            (Technical note: 
            <em>
              Markdown Here
            </em>
             uses GFM line breaks, so there's no need to use MD's two-space line breaks.)
          </p>
          <a
            name="videos"
          />
          <h2>
            YouTube Videos
          </h2>
          <p>
            They can't be added directly but you can add an image with a link to the video like this:
          </p>
          <pre>
            <code
              className="language-no-highlight"
            >
              &lt;a href="http://www.youtube.com/watch?feature=player_embedded&v=YOUTUBE_VIDEO_ID_HERE
      " target="_blank"&gt;&lt;img src="http://img.youtube.com/vi/YOUTUBE_VIDEO_ID_HERE/0.jpg"
      alt="IMAGE ALT TEXT HERE" width="240" height="180" border="10" /&gt;&lt;/a&gt;
            </code>
          </pre>
          <p>
            Or, in pure Markdown, but losing the image sizing and border:
          </p>
          <pre>
            <code
              className="language-no-highlight"
            >
              [![IMAGE ALT TEXT HERE](http://img.youtube.com/vi/YOUTUBE_VIDEO_ID_HERE/0.jpg)](http://www.youtube.com/watch?v=YOUTUBE_VIDEO_ID_HERE)
            </code>
          </pre>
        </React.Fragment>,
      }
    `)
})

test('mdx jsx with unknown components are ignored', () => {
    // Note: In MDX, <custom-element> is treated as MDX JSX, not raw HTML
    // Unknown JSX components are ignored completely (including their content)
    const code = dedent`
    # Heading with JSX
    
    This is a paragraph with some JSX components.
    
    <div>This is a valid div</div>
    
    <CustomElement>This unknown component should be ignored</CustomElement>
    
    <span className="highlight">This span is valid</span>
    
    <AnotherUnknown>Another unknown component content</AnotherUnknown>
    
    More text after JSX.
    `
    
    const { html, result, errors } = render(code)
    
    // Check that valid HTML elements are present
    expect(html).toContain('<div>This is a valid div</div>')
    expect(html).toContain('<span')
    expect(html).toContain('This span is valid</span>')
    
    // Check that unknown components are completely ignored
    expect(html).not.toContain('CustomElement')
    expect(html).not.toContain('AnotherUnknown')
    expect(html).not.toContain('This unknown component should be ignored')
    expect(html).not.toContain('Another unknown component content')
    
    // Check that errors were generated for unknown components
    expect(errors).toHaveLength(2)
    expect(errors[0]!.message).toContain('Unsupported jsx component CustomElement')
    expect(errors[1]!.message).toContain('Unsupported jsx component AnotherUnknown')
    
    expect(result).toMatchInlineSnapshot(`
      <React.Fragment>
        <h1>
          Heading with JSX
        </h1>
        <p>
          This is a paragraph with some JSX components.
        </p>
        <div>
          This is a valid div
        </div>
        <span
          className="highlight"
        >
          This span is valid
        </span>
        <p>
          More text after JSX.
        </p>
      </React.Fragment>
    `)
})

test('code block rendering', () => {
    const code = dedent`
`
    expect(
        render(dedent`
      \`\`\`typescript
      const x = 1;
      \`\`\`

      \`\`\`invalid-language
      const y = 2;
      \`\`\`
    `),
    ).toMatchInlineSnapshot(`
      {
        "errors": [],
        "html": "<pre><code class="language-typescript">const x = 1;</code></pre><pre><code class="language-invalid-language">const y = 2;</code></pre>",
        "result": <React.Fragment>
          <pre>
            <code
              className="language-typescript"
            >
              const x = 1;
            </code>
          </pre>
          <pre>
            <code
              className="language-invalid-language"
            >
              const y = 2;
            </code>
          </pre>
        </React.Fragment>,
      }
    `)
})

test('code is not wrapped by p', () => {
    const code = `
---
title: createSearchParams
---

# createSearchParams

[MODES: framework, data, declarative]

## Summary

[Reference Documentation ↗](https://api.reactrouter.com/v7/functions/react_router.createSearchParams.html)

Creates a URLSearchParams object using the given initializer.

This is identical to \`new URLSearchParams(init)\` except it also
supports arrays as values in the object form of the initializer
instead of just strings. This is convenient when you need multiple
values for a given key, but don't want to use an array initializer.

For example, instead of:

\`\`\`tsx
let searchParams = new URLSearchParams([
  ["sort", "name"],
  ["sort", "price"],
]);
\`\`\`

you can do:

\`\`\`
let searchParams = createSearchParams({
  sort: ['name', 'price']
});
\`\`\`

## Signature

\`\`\`tsx
createSearchParams(init): URLSearchParams
\`\`\`

## Params

### init

[modes: framework, data, declarative]

_No documentation_

  `
    const jsx = render(code)
    expect(jsx.result).toMatchInlineSnapshot(`
      <React.Fragment>
        <hr />
        <h2>
          title: createSearchParams
        </h2>
        <h1>
          createSearchParams
        </h1>
        <p>
          [MODES: framework, data, declarative]
        </p>
        <h2>
          Summary
        </h2>
        <p>
          <a
            href="https://api.reactrouter.com/v7/functions/react_router.createSearchParams.html"
            title=""
          >
            Reference Documentation ↗
          </a>
        </p>
        <p>
          Creates a URLSearchParams object using the given initializer.
        </p>
        <p>
          This is identical to 
          <code>
            new URLSearchParams(init)
          </code>
           except it also
      supports arrays as values in the object form of the initializer
      instead of just strings. This is convenient when you need multiple
      values for a given key, but don't want to use an array initializer.
        </p>
        <p>
          For example, instead of:
        </p>
        <pre>
          <code
            className="language-tsx"
          >
            let searchParams = new URLSearchParams([
        ["sort", "name"],
        ["sort", "price"],
      ]);
          </code>
        </pre>
        <p>
          you can do:
        </p>
        <pre>
          <code>
            let searchParams = createSearchParams({
        sort: ['name', 'price']
      });
          </code>
        </pre>
        <h2>
          Signature
        </h2>
        <pre>
          <code
            className="language-tsx"
          >
            createSearchParams(init): URLSearchParams
          </code>
        </pre>
        <h2>
          Params
        </h2>
        <h3>
          init
        </h3>
        <p>
          [modes: framework, data, declarative]
        </p>
        <p>
          <em>
            No documentation
          </em>
        </p>
      </React.Fragment>
    `)
})

test('component props schema validation with zod', () => {
    const HeadingSchema = z.object({
        level: z.number().min(1).max(6),
        title: z.string().optional(),
    })

    const CardsSchema = z.object({
        count: z.number().positive(),
        variant: z.enum(['default', 'outline']).optional(),
    })

    const componentPropsSchema: ComponentPropsSchema = {
        Heading: HeadingSchema,
        Cards: CardsSchema,
    }

    const code = dedent`
        <Heading level={2} title="test">Valid heading</Heading>
        
        <Cards count={3} variant="outline">Valid cards</Cards>
        
        <Heading level={10} title="test">Invalid heading - level too high</Heading>
        
        <Cards count={-1}>Invalid cards - negative count</Cards>
        
        <Cards count="not a number">Invalid cards - wrong type</Cards>
    `

    expect(render(code, componentPropsSchema)).toMatchInlineSnapshot(`
      {
        "errors": [
          {
            "line": 5,
            "message": "Invalid props for component "Heading" at "level": Too big: expected number to be <=6",
            "schemaPath": "level",
            "type": "validation",
          },
          {
            "line": 7,
            "message": "Invalid props for component "Cards" at "count": Too small: expected number to be >0",
            "schemaPath": "count",
            "type": "validation",
          },
          {
            "line": 9,
            "message": "Invalid props for component "Cards" at "count": Invalid input: expected number, received string",
            "schemaPath": "count",
            "type": "validation",
          },
        ],
        "html": "<h1 title="test">Valid heading</h1><div count="3" variant="outline">Valid cards</div><h1 title="test">Invalid heading - level too high</h1><div count="-1">Invalid cards - negative count</div><div count="not a number">Invalid cards - wrong type</div>",
        "result": <React.Fragment>
          <Heading
            level={2}
            title="test"
          >
            Valid heading
          </Heading>
          <Cards
            count={3}
            variant="outline"
          >
            Valid cards
          </Cards>
          <Heading
            level={10}
            title="test"
          >
            Invalid heading - level too high
          </Heading>
          <Cards
            count={-1}
          >
            Invalid cards - negative count
          </Cards>
          <Cards
            count="not a number"
          >
            Invalid cards - wrong type
          </Cards>
        </React.Fragment>,
      }
    `)
})

test('onError callback is called for each error', () => {
    const errors: any[] = []
    const code = dedent`
        <Missing>should error</Missing>
        
        <Heading level={10}>invalid level</Heading>
    `
    const componentPropsSchema: ComponentPropsSchema = {
        Heading: z.object({
            level: z.number().min(1).max(6),
        }),
    }
    const mdast = mdxParse(code)
    const visitor = new MdastToJsx({
        markdown: code,
        mdast,
        components,
        componentPropsSchema,
        onError: (err) => errors.push(err),
    })
    visitor.run()
    expect(errors).toMatchInlineSnapshot(`
      [
        {
          "line": 1,
          "message": "Unsupported jsx component Missing",
          "type": "missing-component",
        },
        {
          "line": 3,
          "message": "Invalid props for component "Heading" at "level": Too big: expected number to be <=6",
          "schemaPath": "level",
          "type": "validation",
        },
      ]
    `)
    // errors array and onError callback should have the same errors
    expect(visitor.errors).toEqual(errors)
})

test('onError callback can throw to stop rendering', () => {
    const code = dedent`
        <Missing>should throw</Missing>
        
        <Heading>should not reach</Heading>
    `
    const mdast = mdxParse(code)
    expect(() => {
        const visitor = new MdastToJsx({
            markdown: code,
            mdast,
            components,
            onError: (err) => {
                throw new Error(`MDX error on line ${err.line}: ${err.message}`)
            },
        })
        visitor.run()
    }).toThrow('MDX error on line 1: Unsupported jsx component Missing')
})

test('mdx expressions evaluation', () => {
    expect(
        render(dedent`
        # Expression Test

        Simple math: {1 + 2}

        <Heading>
        Inside JSX: {3 * 4}
        </Heading>

        Boolean: {true}
        String concat: {"hello" + " world"}
        `),
    ).toMatchInlineSnapshot(`
      {
        "errors": [],
        "html": "<h1>Expression Test</h1><p>Simple math: 3</p><h1><p>Inside JSX: 12</p></h1><p>Boolean: 
      String concat: hello world</p>",
        "result": <React.Fragment>
          <h1>
            Expression Test
          </h1>
          <p>
            Simple math: 
            3
          </p>
          <Heading>
            <p>
              Inside JSX: 
              12
            </p>
          </Heading>
          <p>
            Boolean: 
            true
            
      String concat: 
            hello world
          </p>
        </React.Fragment>,
      }
    `)
})

test('mdx expressions with unsupported functions', () => {
    expect(
        render(dedent`
        Math function: {Math.max(5, 10)}
        Console: {console.log("test")}
        `),
    ).toMatchInlineSnapshot(`
      {
        "errors": [
          {
            "line": 1,
            "message": "Failed to evaluate expression: Math.max(5, 10). Functions are not supported",
            "type": "expression",
          },
          {
            "line": 2,
            "message": "Failed to evaluate expression: console.log("test"). Functions are not supported",
            "type": "expression",
          },
        ],
        "html": "<p>Math function: 
      Console: </p>",
        "result": <React.Fragment>
          <p>
            Math function: 
            
      Console: 
          </p>
        </React.Fragment>,
      }
    `)
})

test('schema validation without errors', () => {
    const HeadingSchema = z.object({
        level: z.number().min(1).max(6),
        title: z.string().optional(),
    })

    const componentPropsSchema: ComponentPropsSchema = {
        Heading: HeadingSchema,
    }

    const code = dedent`
        <Heading level={2} title="test">Valid heading</Heading>
        <Heading level={1}>Another valid heading</Heading>
    `

    expect(render(code, componentPropsSchema)).toMatchInlineSnapshot(`
      {
        "errors": [],
        "html": "<h1 title="test">Valid heading</h1><h1>Another valid heading</h1>",
        "result": <React.Fragment>
          <Heading
            level={2}
            title="test"
          >
            Valid heading
          </Heading>
          <Heading
            level={1}
          >
            Another valid heading
          </Heading>
        </React.Fragment>,
      }
    `)
})

test('component without schema should not be validated', () => {
    const HeadingSchema = z.object({
        level: z.number().min(1).max(6),
    })

    const componentPropsSchema: ComponentPropsSchema = {
        Heading: HeadingSchema,
    }

    const code = dedent`
        <Heading level={2}>Valid heading with schema</Heading>
        <Cards invalidProp="anything">Cards without schema - should not be validated</Cards>
    `

    expect(render(code, componentPropsSchema)).toMatchInlineSnapshot(`
      {
        "errors": [],
        "html": "<h1>Valid heading with schema</h1><div invalidProp="anything">Cards without schema - should not be validated</div>",
        "result": <React.Fragment>
          <Heading
            level={2}
          >
            Valid heading with schema
          </Heading>
          <Cards
            invalidProp="anything"
          >
            Cards without schema - should not be validated
          </Cards>
        </React.Fragment>,
      }
    `)
})

test('validation error includes schema path', () => {
    const ComplexSchema = z.object({
        user: z.object({
            name: z.string(),
            age: z.number().min(0),
        }),
        settings: z.object({
            theme: z.enum(['light', 'dark']),
        }),
    })

    const componentPropsSchema: ComponentPropsSchema = {
        Heading: ComplexSchema,
    }

    const code = dedent`
        <Heading user={{ name: "test", age: -1 }} settings={{ theme: "invalid" }}>Complex validation</Heading>
    `

    expect(render(code, componentPropsSchema)).toMatchInlineSnapshot(`
      {
        "errors": [
          {
            "line": 1,
            "message": "Invalid props for component "Heading" at "user.age": Too small: expected number to be >=0",
            "schemaPath": "user.age",
            "type": "validation",
          },
          {
            "line": 1,
            "message": "Invalid props for component "Heading" at "settings.theme": Invalid option: expected one of "light"|"dark"",
            "schemaPath": "settings.theme",
            "type": "validation",
          },
        ],
        "html": "<h1 user="[object Object]" settings="[object Object]">Complex validation</h1>",
        "result": <React.Fragment>
          <Heading
            settings={
              {
                "theme": "invalid",
              }
            }
            user={
              {
                "age": -1,
                "name": "test",
              }
            }
          >
            Complex validation
          </Heading>
        </React.Fragment>,
      }
    `)
})

test('mdxJsxExpressionAttribute spread syntax', () => {
    expect(
        render(dedent`
        <Heading 
            {...{key: '1', level: 2}}
            title="test"
        >
        Content with spread
        </Heading>
        `),
    ).toMatchInlineSnapshot(`
      {
        "errors": [],
        "html": "<h1 title="test"><p>Content with spread</p></h1>",
        "result": <React.Fragment>
          <Heading
            level={2}
            title="test"
          >
            <p>
              Content with spread
            </p>
          </Heading>
        </React.Fragment>,
      }
    `)
})

test('mdxJsxExpressionAttribute complex spread cases', () => {
    expect(
        render(dedent`
        <Heading 
            {...{
                level: 3,
                active: true,
                disabled: false,
                count: 42,
                title: "spread title",
                nested: {
                    prop: "value"
                }
            }}
        >
        Complex spread test
        </Heading>

        <Cards 
            {...{style: {color: "red", fontSize: "16px"}}}
            {...{className: "test-class", id: "test-id"}}
        >
        Multiple spreads
        </Cards>
        `),
    ).toMatchInlineSnapshot(`
      {
        "errors": [],
        "html": "<h1 count="42" title="spread title" nested="[object Object]"><p>Complex spread test</p></h1><div style="color:red;font-size:16px" class="test-class" id="test-id"><p>Multiple spreads</p></div>",
        "result": <React.Fragment>
          <Heading
            active={true}
            count={42}
            disabled={false}
            level={3}
            nested={
              {
                "prop": "value",
              }
            }
            title="spread title"
          >
            <p>
              Complex spread test
            </p>
          </Heading>
          <Cards
            className="test-class"
            id="test-id"
            style={
              {
                "color": "red",
                "fontSize": "16px",
              }
            }
          >
            <p>
              Multiple spreads
            </p>
          </Cards>
        </React.Fragment>,
      }
    `)
})

test('mdxJsxExpressionAttribute edge cases', () => {
    expect(
        render(dedent`
        <Heading {...{}} title="empty spread">Empty spread</Heading>
        
        <Heading {...{null: null, undefined: undefined}} title="null/undefined values">Null/undefined</Heading>
        
        <Heading {...{array: [1, 2, 3], object: {nested: true}}} title="complex values">Complex types</Heading>
        `),
    ).toMatchInlineSnapshot(`
      {
        "errors": [
          {
            "line": 3,
            "message": "Failed to evaluate expression attribute: ...{null: null, undefined: undefined}. undefined is undefined",
            "type": "expression",
          },
        ],
        "html": "<h1 title="empty spread">Empty spread</h1><h1 title="null/undefined values">Null/undefined</h1><h1 array="1,2,3" object="[object Object]" title="complex values">Complex types</h1>",
        "result": <React.Fragment>
          <Heading
            title="empty spread"
          >
            Empty spread
          </Heading>
          <Heading
            title="null/undefined values"
          >
            Null/undefined
          </Heading>
          <Heading
            array={
              [
                1,
                2,
                3,
              ]
            }
            object={
              {
                "nested": true,
              }
            }
            title="complex values"
          >
            Complex types
          </Heading>
        </React.Fragment>,
      }
    `)
})

test('ESM imports from https URLs', () => {
    const code = dedent`
    import Button from 'https://esm.sh/some-button-component'
    import { Card, Modal } from 'https://esm.sh/some-ui-library'
    
    # Hello
    
    <Button>Click me</Button>
    
    <Card title="Test Card">
        Content inside card
    </Card>
    
    <Modal open={true}>
        Modal content
    </Modal>
    `
    
    const mdast = mdxParse(code)
    const visitor = new MdastToJsx({ markdown: code, mdast, components, allowClientEsmImports: true })
    const result = visitor.run()
    
    // Check that imports were parsed correctly
    expect(visitor.esmImports.size).toBe(3)
    expect(visitor.esmImports.get('Button')).toBe('https://esm.sh/some-button-component')
    expect(visitor.esmImports.get('Card')).toBe('https://esm.sh/some-ui-library#Card')
    expect(visitor.esmImports.get('Modal')).toBe('https://esm.sh/some-ui-library#Modal')
    
    // Since these are dynamic imports that only work on client, the server render should return null
    const html = renderToStaticMarkup(result)
    expect(html).toMatchInlineSnapshot(`"<link href="https://esm.sh" rel="dns-prefetch"/><link rel="preconnect" href="https://esm.sh"/><h1>Hello</h1>"`)
    
    expect(visitor.errors).toEqual([])
})

test('ESM imports error handling', () => {
    const code = dedent`
    import Button from 'file:///local/path'
    import Component from './relative/path'
    
    # Test
    
    <Button>Local import should not work</Button>
    <Component>Relative import should not work</Component>
    `
    
    const mdast = mdxParse(code)
    const visitor = new MdastToJsx({ markdown: code, mdast, components, allowClientEsmImports: true })
    const result = visitor.run()
    
    // Only https imports should be processed
    expect(visitor.esmImports.size).toBe(0)
    
    // Should have 4 errors: 2 for invalid imports, 2 for unsupported components
    expect(visitor.errors.length).toBe(4)
    
    // First two errors are for invalid imports
    expect(visitor.errors[0]!.message).toContain('Invalid import URL')
    expect(visitor.errors[1]!.message).toContain('Invalid import URL')
    
    // Last two errors are for unsupported components
    expect(visitor.errors[2]!.message).toContain('Unsupported jsx component Button')
    expect(visitor.errors[3]!.message).toContain('Unsupported jsx component Component')
})

test('jsx components in attributes', () => {
    const code = dedent`
    # JSX Components in Attributes

    <Heading icon={<span>👋</span>} level={1}>
    Hello World
    </Heading>

    <Cards items={<div>Item 1</div>}>
    Some content
    </Cards>
    `
    
    const { result, errors, html } = render(code)
    
    // Should not have any errors
    expect(errors).toMatchInlineSnapshot(`[]`)
    
    // Should render correctly
    expect(html).toMatchInlineSnapshot(`"<h1>JSX Components in Attributes</h1><h1 icon="[object Object]"><p>Hello World</p></h1><div items="[object Object]"><p>Some content</p></div>"`)
    
    expect(result).toMatchInlineSnapshot(`
      <React.Fragment>
        <h1>
          JSX Components in Attributes
        </h1>
        <Heading
          icon={
            <span>
              👋
            </span>
          }
          level={1}
        >
          <p>
            Hello World
          </p>
        </Heading>
        <Cards
          items={
            <div>
              Item 1
            </div>
          }
        >
          <p>
            Some content
          </p>
        </Cards>
      </React.Fragment>
    `)
})

test('jsx components in attributes with ESM imports', () => {
    const code = dedent`
    import Button from 'https://esm.sh/some-button-component'
    import { Icon } from 'https://esm.sh/some-icon-library'
    
    # ESM Components in Attributes

    <Heading icon={<Icon name="star" />} level={1}>
    Hello World
    </Heading>

    <Cards actionButton={<Button>Click me</Button>}>
    Some content
    </Cards>
    `
    
    const { result, errors, html } = render(code, undefined, true)
    
    // Should not have any errors
    expect(errors).toMatchInlineSnapshot(`[]`)
    
    // Should render correctly - ESM components should be wrapped in DynamicEsmComponent
    expect(html).toMatchInlineSnapshot(`"<h1>ESM Components in Attributes</h1><h1 icon="[object Object]"><p>Hello World</p></h1><div actionButton="[object Object]"><p>Some content</p></div>"`)
    
    expect(result).toMatchInlineSnapshot(`
      <React.Fragment>
        <h1>
          ESM Components in Attributes
        </h1>
        <Heading
          icon={
            <DynamicEsmComponent
              componentName="Icon"
              importUrl="https://esm.sh/some-icon-library"
              name="star"
            />
          }
          level={1}
        >
          <p>
            Hello World
          </p>
        </Heading>
        <Cards
          actionButton={
            <DynamicEsmComponent
              componentName="default"
              importUrl="https://esm.sh/some-button-component"
            >
              Click me
            </DynamicEsmComponent>
          }
        >
          <p>
            Some content
          </p>
        </Cards>
      </React.Fragment>
    `)
})

test('ESM imports disabled by default', () => {
    const code = dedent`
    import Button from 'https://esm.sh/some-button-component'
    
    # Test Default Behavior

    <Button>This should not work</Button>
    `
    
    const { result, errors, html } = render(code) // No allowClientEsmImports flag
    
    // ESM imports should not be processed when disabled
    const mdast = mdxParse(code)
    const visitor = new MdastToJsx({ markdown: code, mdast, components }) // Default allowClientEsmImports: false
    expect(visitor.esmImports.size).toBe(0)
    
    // Should have error for unsupported component
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some(e => e.message.includes('Unsupported jsx component Button'))).toBe(true)
    
    // Should render heading but not the button
    expect(html).toMatchInlineSnapshot(`"<h1>Test Default Behavior</h1>"`)
})

test("jsx components in attributes error handling", () => {
    const code = dedent`
    # Error Handling Test

    <Heading icon={<UnsupportedComponent />} level={1}>
    Hello World
    </Heading>
    `
    
    const { result, errors, html } = render(code)
    
    // Should have an error for the unsupported component
    expect(errors).toMatchInlineSnapshot(`
      [
        {
          "line": 3,
          "message": "Unsupported jsx component UnsupportedComponent in attribute",
          "type": "missing-component",
        },
        {
          "line": 3,
          "message": "Failed to evaluate expression attribute: icon={<UnsupportedComponent />}. visitor "JSXElement" is not supported",
          "type": "expression",
        },
        {
          "line": 3,
          "message": "Expressions in jsx prop not evaluated: (icon={<UnsupportedComponent />})",
          "type": "expression",
        },
      ]
    `)
    
    // Should still render the rest of the content
    expect(html).toMatchInlineSnapshot(`"<h1>Error Handling Test</h1><h1><p>Hello World</p></h1>"`)
    
    expect(result).toMatchInlineSnapshot(`
      <React.Fragment>
        <h1>
          Error Handling Test
        </h1>
        <Heading
          level={1}
        >
          <p>
            Hello World
          </p>
        </Heading>
      </React.Fragment>
    `)
})

test('addMarkdownLineNumbers adds data-markdown-line attributes', () => {
    const code = dedent`
    # Hello World

    This is a **paragraph** with *emphasis*.

    <Heading level={2}>
    Custom component
    </Heading>

    - List item 1
    - List item 2

    | Column 1 | Column 2 |
    |----------|----------|
    | Cell 1   | Cell 2   |
    `
    
    const { result, errors, html } = render(code, undefined, false, true)
    
    // Should not have any errors
    expect(errors).toMatchInlineSnapshot(`[]`)
    
    // Check that data-markdown-line attributes are present in HTML
    expect(html).toContain('data-markdown-line="1"')
    expect(html).toContain('data-markdown-line="3"')
    expect(html).toContain('data-markdown-line="9"')
    
    expect(result).toMatchInlineSnapshot(`
      <React.Fragment>
        <h1
          data-markdown-line={1}
        >
          Hello World
        </h1>
        <p
          data-markdown-line={3}
        >
          This is a 
          <strong
            data-markdown-line={3}
          >
            paragraph
          </strong>
           with 
          <em
            data-markdown-line={3}
          >
            emphasis
          </em>
          .
        </p>
        <Heading
          data-markdown-line={5}
          level={2}
        >
          <p
            data-markdown-line={6}
          >
            Custom component
          </p>
        </Heading>
        <ul
          data-markdown-line={9}
        >
          <li
            data-markdown-line={9}
          >
            <p
              data-markdown-line={9}
            >
              List item 1
            </p>
          </li>
          <li
            data-markdown-line={10}
          >
            <p
              data-markdown-line={10}
            >
              List item 2
            </p>
          </li>
        </ul>
        <table
          data-markdown-line={12}
        >
          <thead>
            <tr
              className=""
              data-markdown-line={12}
            >
              <td
                className=""
                data-markdown-line={12}
              >
                Column 1
              </td>
              <td
                className=""
                data-markdown-line={12}
              >
                Column 2
              </td>
            </tr>
          </thead>
          <tbody>
            <tr
              className=""
              data-markdown-line={14}
            >
              <td
                className=""
                data-markdown-line={14}
              >
                Cell 1
              </td>
              <td
                className=""
                data-markdown-line={14}
              >
                Cell 2
              </td>
            </tr>
          </tbody>
        </table>
      </React.Fragment>
    `)
})

test('addMarkdownLineNumbers works with custom MDX components', () => {
    const code = dedent`
    # Regular Heading

    <Heading level={1}>
    Custom component on line 3
    </Heading>

    Regular paragraph.

    <Cards count={2}>
    Another custom component on line 9
    </Cards>
    `
    
    const { result, errors, html } = render(code, undefined, false, true)
    
    // Should not have any errors
    expect(errors).toMatchInlineSnapshot(`[]`)
    
    // Check that custom components have line numbers
    expect(html).toContain('data-markdown-line="3"')
    expect(html).toContain('data-markdown-line="9"')
    
    expect(result).toMatchInlineSnapshot(`
      <React.Fragment>
        <h1
          data-markdown-line={1}
        >
          Regular Heading
        </h1>
        <Heading
          data-markdown-line={3}
          level={1}
        >
          <p
            data-markdown-line={4}
          >
            Custom component on line 3
          </p>
        </Heading>
        <p
          data-markdown-line={7}
        >
          Regular paragraph.
        </p>
        <Cards
          count={2}
          data-markdown-line={9}
        >
          <p
            data-markdown-line={10}
          >
            Another custom component on line 9
          </p>
        </Cards>
      </React.Fragment>
    `)
})

test('jsx component with complex array props should show clear error message', () => {
    const code = dedent`
    <Tabs items={invalidFunction()} />
    `
    
    const { errors } = render(code)
    
    // Should have error with original error message included
    expect(errors.length).toBeGreaterThan(0)
    
    // Find the error that contains the expression evaluation message
    const expressionError = errors.find(err => 
        err.message.includes('Failed to evaluate expression attribute: items={invalidFunction()}')
    )
    
    expect(expressionError).toBeDefined()
    expect(expressionError!.message).toContain('Functions are not supported')
    expect(expressionError!.line).toBe(1)
})

test('override renderNode to wrap bold text in colored span', () => {
    const code = dedent`
    This is **bold text** and this is regular text.
    
    Another line with **more bold** content.
    `
    
    const mdast = mdxParse(code)
    const visitor = new MdastToJsx({ 
        markdown: code, 
        mdast, 
        components,
        renderNode: (node, transform) => {
            if (node.type === 'strong') {
                return (
                    <span style={{ color: 'red', fontWeight: 'bold' }}>
                        {node.children?.map(child => transform(child))}
                    </span>
                )
            }
            // Return undefined to use default rendering
            return undefined
        }
    })
    
    const result = visitor.run()
    const html = renderToStaticMarkup(result)
    
    expect(html).toMatchInlineSnapshot(`"<p>This is <span style="color:red;font-weight:bold">bold text</span> and this is regular text.</p><p>Another line with <span style="color:red;font-weight:bold">more bold</span> content.</p>"`)
})

test("skip unknown elements in raw HTML content", () => {
  const { html } = render(`
Some text before
<html><body>
<p>Valid paragraph</p>
<unknonw>This content should be preserved</unknonw>
<div>Valid div</div>
<faketag>Another preserved content</faketag>
</body></html>
Some text after
`);
  expect(html).toMatchInlineSnapshot(`"<p>Some text before</p><p>Some text after</p>"`);
});

test("skip unknown elements in complex nested HTML structures", () => {
  const { html } = render(`
# Main Title

<article>
  <header>
    <h1>Article Title</h1>
    <customheader>
      <p>This paragraph should be preserved</p>
      <time>2024-01-01</time>
    </customheader>
  </header>
  
  <section>
    <blockquote>
      <p>A famous quote</p>
      <customcite>
        <strong>- Author Name</strong>
        <unknowntag>
          <em>from a book</em>
          <span>published in <b>2024</b></span>
        </unknowntag>
      </customcite>
    </blockquote>
    
    <fakesection>
      <h2>Nested Heading</h2>
      <ul>
        <li>First item with <invalidtag>nested <code>code</code></invalidtag></li>
        <li>Second item</li>
        <customli>Third item should show</customli>
      </ul>
    </fakesection>
  </section>
  
  <footer>
    <customfooter>
      <nav>
        <a href="#top">Back to top</a>
        <fakelink>
          <span>Contact us</span>
        </fakelink>
      </nav>
    </customfooter>
  </footer>
</article>

## Another Section

<div>
  <customelement>
    <table>
      <thead>
        <tr>
          <th>Header 1</th>
          <customth>Header 2 content</customth>
        </tr>
      </thead>
      <tbody>
        <customrow>
          <td>Cell 1</td>
          <td>Cell 2</td>
        </customrow>
      </tbody>
    </table>
  </customelement>
</div>
`);
  
   expect(html).toMatchInlineSnapshot(`"<h1>Main Title</h1><article><header><h1>Article Title</h1></header><section><blockquote><p>A famous quote</p></blockquote></section><footer></footer></article><h2>Another Section</h2><div></div>"`);
});

/* ── modules prop tests ─────────────────────────────────────────────── */

test('modules prop: resolves named import from absolute path', () => {
    function CustomBadge({ label }: { label: string }) {
        return <span className="badge">{label}</span>
    }

    const code = dedent`
        import { CustomBadge } from '/snippets/badge'

        # Hello

        <CustomBadge label="Works" />
    `
    const mdast = mdxParse(code)
    const visitor = new MdastToJsx({
        markdown: code,
        mdast,
        components,
        modules: {
            './snippets/badge.tsx': { CustomBadge },
        },
        baseUrl: './pages/',
    })
    const result = visitor.run()
    const html = renderToStaticMarkup(result)
    expect(html).toMatchInlineSnapshot(`"<h1>Hello</h1><span class="badge">Works</span>"`)
    expect(visitor.errors).toMatchInlineSnapshot(`[]`)
})

test('modules prop: resolves default import from relative path', () => {
    function MyCard({ children }: { children?: React.ReactNode }) {
        return <div className="card">{children}</div>
    }

    const code = dedent`
        import MyCard from './card'

        <MyCard>content</MyCard>
    `
    const mdast = mdxParse(code)
    const visitor = new MdastToJsx({
        markdown: code,
        mdast,
        components,
        modules: {
            './pages/card.tsx': { default: MyCard },
        },
        baseUrl: './pages/',
    })
    const result = visitor.run()
    const html = renderToStaticMarkup(result)
    expect(html).toMatchInlineSnapshot(`"<div class="card">content</div>"`)
    expect(visitor.errors).toMatchInlineSnapshot(`[]`)
})

test('modules prop: resolves namespace import with dot notation', () => {
    function Card({ title }: { title: string }) {
        return <div>{title}</div>
    }
    function Badge({ label }: { label: string }) {
        return <span>{label}</span>
    }

    const code = dedent`
        import * as UI from './ui'

        <UI.Card title="hello" />
        <UI.Badge label="tag" />
    `
    const mdast = mdxParse(code)
    const visitor = new MdastToJsx({
        markdown: code,
        mdast,
        components,
        modules: {
            './components/ui.tsx': { Card, Badge },
        },
        baseUrl: './components/',
    })
    const result = visitor.run()
    const html = renderToStaticMarkup(result)
    expect(html).toMatchInlineSnapshot(`"<div>hello</div><span>tag</span>"`)
    expect(visitor.errors).toMatchInlineSnapshot(`[]`)
})

test('modules prop: unresolved import produces error', () => {
    const code = dedent`
        import { Missing } from './nonexistent'

        <Missing />
    `
    const mdast = mdxParse(code)
    const visitor = new MdastToJsx({
        markdown: code,
        mdast,
        components,
        modules: {},
        baseUrl: './pages/',
    })
    const result = visitor.run()
    const html = renderToStaticMarkup(result)
    expect(html).toMatchInlineSnapshot(`""`)
    expect(visitor.errors).toMatchInlineSnapshot(`
      [
        {
          "line": 3,
          "message": "Unsupported jsx component Missing",
          "type": "missing-component",
        },
      ]
    `)
})

test('modules prop: rendering a subset of mdast with import nodes prepended resolves components', () => {
    // Simulates the pattern used by holocron: the full mdast is split into
    // sections, and import nodes (mdxjsEsm) are prepended to each section's
    // nodes so SafeMdxRenderer can resolve imported components.
    function CustomHero({ title }: { title: string }) {
        return <div data-testid="hero">{title}</div>
    }

    const code = dedent`
        import { CustomHero } from './components/hero'

        # Main content

        <CustomHero title="Hello" />
    `
    const mdast = mdxParse(code)

    // Split: extract import nodes and content nodes separately
    const importNodes = mdast.children.filter((node) => node.type === 'mdxjsEsm')
    const contentNodes = mdast.children.filter((node) => node.type !== 'mdxjsEsm')

    // Render only content nodes WITH import nodes prepended
    const syntheticRoot = { type: 'root' as const, children: [...importNodes, ...contentNodes] }
    const visitor = new MdastToJsx({
        markdown: code,
        mdast: syntheticRoot,
        components,
        modules: {
            './components/hero.tsx': { CustomHero },
        },
        baseUrl: './',
    })
    const result = visitor.run()
    const html = renderToStaticMarkup(result)
    expect(html).toContain('data-testid="hero"')
    expect(html).toContain('Hello')
    expect(visitor.errors).toMatchInlineSnapshot(`[]`)
})

test('modules prop: rendering subset WITHOUT import nodes fails to resolve components', () => {
    // Demonstrates the bug: if import nodes are NOT prepended, the component
    // is not found and a missing-component error is produced.
    function CustomHero({ title }: { title: string }) {
        return <div data-testid="hero">{title}</div>
    }

    const code = dedent`
        import { CustomHero } from './components/hero'

        <CustomHero title="Hello" />
    `
    const mdast = mdxParse(code)

    // Only render the JSX node WITHOUT the import node
    const contentNodes = mdast.children.filter((node) => node.type !== 'mdxjsEsm')
    const syntheticRoot = { type: 'root' as const, children: contentNodes }
    const visitor = new MdastToJsx({
        markdown: code,
        mdast: syntheticRoot,
        components,
        modules: {
            './components/hero.tsx': { CustomHero },
        },
        baseUrl: './',
    })
    const result = visitor.run()
    const html = renderToStaticMarkup(result)
    // Without import nodes, the component is not resolved
    expect(html).not.toContain('data-testid="hero"')
    expect(visitor.errors).toMatchInlineSnapshot(`
      [
        {
          "line": 3,
          "message": "Unsupported jsx component CustomHero",
          "type": "missing-component",
        },
      ]
    `)
})

test('scope with function in jsx prop receiving object arg', () => {
    const scope = {
        formatTitle: (opts: { text: string; uppercase?: boolean }) => {
            return opts.uppercase ? opts.text.toUpperCase() : opts.text
        },
    }

    const code = dedent`
        <Heading level={1} title={formatTitle({ text: "hello world", uppercase: true })}>Content</Heading>
    `

    const { html, errors } = render(code, undefined, undefined, undefined, scope)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"<h1 title="HELLO WORLD">Content</h1>"`)
})

test('scope with variables and functions in inline expressions', () => {
    const scope = {
        greeting: 'Hello',
        getName: (user: { first: string; last: string }) => `${user.first} ${user.last}`,
    }

    const code = dedent`
        {greeting} {getName({ first: "John", last: "Doe" })}
    `

    const { html, errors } = render(code, undefined, undefined, undefined, scope)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"HelloJohn Doe"`)
})

test('scope with function in spread attribute', () => {
    const scope = {
        getProps: (config: { level: number }) => ({ level: config.level }),
    }

    const code = dedent`
        <Heading {...getProps({ level: 2 })}>Spread test</Heading>
    `

    const { html, errors } = render(code, undefined, undefined, undefined, scope)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"<h1>Spread test</h1>"`)
})

test('scope with .map and arrow function callback fails without generate', () => {
    const scope = {
        items: [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Charlie' }],
    }

    const code = dedent`
        {items.map(item => item.name).join(", ")}
    `

    const { html, errors } = render(code, undefined, undefined, undefined, scope)
    expect(errors).toMatchInlineSnapshot(`
      [
        {
          "line": 1,
          "message": "Failed to evaluate expression: items.map(item => item.name).join(", "). Expected options.generate to be the "generate" function from "escodegen"",
          "type": "expression",
        },
      ]
    `)
    expect(html).toMatchInlineSnapshot(`""`)
})

test('scope with .map and arrow function callback works with generate', () => {
    const scope = {
        items: [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Charlie' }],
    }

    const code = dedent`
        {items.map(item => item.name).join(", ")}
    `

    const { html, errors } = render(code, undefined, undefined, undefined, scope, { generate })
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"Alice, Bob, Charlie"`)
})
