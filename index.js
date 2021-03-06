const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const ListIt = require('list-it');

class Sgrape {
  constructor(config) {
    if (!config) return this.kill('Missing a config');

    this.schema = config.schema || this.kill('Missing a schema');
    config.schema.mandatory = true;
    this.startPage =
      config.schema.startPage ||
      this.kill(
        'Missing a schema.startPage in :' + JSON.stringify(config.schema)
      );
    if (this.killed) return;
    this.nextPageSelector = this.schema.nextPageSelector;
    this.helpers = config.helpers;
    this.html = config.html;
    this.done = config.done;
    this.stats = [];
    this.res = [];
    this.currentPage = 0;
    console.log('---new instance of Sgrape created');
    this.launch();
  }

  launch() {
    try {
      puppeteer
        .launch({ headless: true, defaultViewport: null })
        .then(async browser => {
          const page = await browser.newPage();
          try {
            await page.goto(this.startPage);
          } catch (e) {
            return this.kill(e);
          }
          let nextPage = true;
          while (nextPage === true) {
            const bodyHandle = await page.$('body');
            this.html = await page.evaluate(body => body.innerHTML, bodyHandle);
            await bodyHandle.dispose();

            console.log(`Scrapping page ${++this.currentPage}`);
            this.parse();
            if (this.killed) return;
            if (this.nextPageSelector) {
              await page
                .click(this.nextPageSelector)
                .catch(e => (nextPage = false));

              await page.waitFor(2000);
            } else {
              nextPage = false;
            }
          }

          if (this.done) {
            this.done(this.res);
          } else {
            this.log();
          }
          console.log("~~~~~~~ That's all folks ! ~~~~~~~");
        });
    } catch (e) {
      return this.kill(e);
    }
  }

  parse(schema = this.schema, html = this.html) {
    const { selector, mandatory, attr, func } = schema;

    const keys = Object.keys(schema);

    if (!selector)
      return this.kill(
        'Missing selector for schema : ' + JSON.stringify(schema)
      );

    if (!html)
      return this.kill('Missing html in schema : ' + JSON.stringify(schema));

    const $ = cheerio.load(html);

    const els = this.selectElements($, selector, func);
    if (this.killed) return;

    if (!els.length && schema.mandatory)
      return this.kill(
        `No elements founds for mandatory selector '${selector}'`
      );

    if (attr) {
      let val = this.selectAttr($, els, attr);

      if (this.killed) return;

      if (!val && mandatory) {
        return this.kill(
          `No value found for found for mandatory selector '${selector}'`
        );
      }
      return val;
    }
    const res = [];
    els.each((i, el) => {
      const retEl = {};
      keys.forEach(key => {
        if (
          ![
            'selector',
            'startPage',
            'nextPageSelector',
            'mandatory',
            'func'
          ].includes(key)
        ) {
          retEl[key] = this.applyHelper(this.parse(schema[key], el), key);
        }
      });
      if (this.killed) return;
      res.push(retEl);
    });

    this.res.push(...res);
    return this.res;
  }

  selectElements($, selector, func) {
    try {
      return func ? eval('$("' + selector + '").' + func + '()') : $(selector);
    } catch (e) {
      this.kill(e);
    }
  }

  selectAttr($, els, attr) {
    switch (attr) {
      case 'html':
        return els.html();
        break;
      case 'text':
        if (els.length > 1) {
          const arr = [];
          els.each((i, el) =>
            arr.push(
              $(el)
                .text()
                .trim()
            )
          );
          return arr.join(' ');
        } else {
          return els.text().trim();
        }

        break;
      default:
        try {
          return els.attr(attr);
        } catch (e) {
          this.kill(e);
        }
        break;
    }
  }

  applyHelper(val, key) {
    if (this.helpers && typeof this.helpers[key] === 'function')
      return this.helpers[key](val);

    return val;
  }

  log() {
    const buf = new ListIt({ autoAlign: true });
    console.log(buf.d(this.res).toString());
    console.log(`${this.res.length} items`);
  }

  kill(message) {
    console.log('Scrapper stopped : ' + message);
    // process.exit(1);
  }
}

module.exports = Sgrape;
