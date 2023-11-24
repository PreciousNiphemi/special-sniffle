const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const csv = require('fast-csv');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

async function getTextFromHtml(htmlContent) {
  const $ = cheerio.load(htmlContent);
  $('script').remove();
  $('style').remove();
  $('br').each(function() {
    $(this).replaceWith(' ' + $(this).text() + ' ');
  });
  $('span').each(function() {
    $(this).replaceWith(' ' + $(this).text() + ' ');
  });
  $('div').each(function() {
    $(this).replaceWith(' ' + $(this).text() + ' ');
  });
  $('a').each(function() {
    $(this).replaceWith(' ' + $(this).text() + ' ');
  });
  $('p').each(function() {
    $(this).replaceWith(' ' + $(this).text() + ' ');
  });
  $('ul').each(function() {
    $(this).replaceWith(' ' + $(this).text() + ' ');
  });
  $('li').each(function() {
    $(this).replaceWith(' ' + $(this).text() + ' ');
  });
  return $('body').text();
}

async function crawlWebsite(url) {
  let response;
  try {
    response = await axios.get(url);
  } catch (error) {
    return []; // Return an empty array if there's an error
  }

  const text = await getTextFromHtml(response.data);
  const foundEmails = text.match(EMAIL_REGEX) || [];
  console.log("FOUND EMAILS: ", foundEmails)
  return foundEmails;
}

async function main() {
  let websites = [];
  let isFirstRow = true;
  await new Promise((resolve, reject) => {
    fs.createReadStream('./websites.csv')
      .pipe(csv.parse({ headers: true, skipLines:1 }))
      .on('data', (row) => {
        if (isFirstRow) {
          isFirstRow = false;
          return;
        }
        websites.push(row);
      })
      .on('end', resolve)
      .on('error', reject);
  });

  // Loop through the websites after all have been read from the CSV
  for (let i = 0; i < websites.length; i++) {
    if (!websites[i]['Emails']) {
      let newWebsite = `http://${websites[i]['Root Domain']}`
      if (!newWebsite || !(newWebsite.startsWith('http://') || newWebsite.startsWith('https://'))) {
        continue;
      }
      const emails = await crawlWebsite(newWebsite);
      const uniqueEmails = [...new Set(emails)];
      websites[i]['Emails'] = uniqueEmails.join(', ');

      const csvWriter = createCsvWriter({
        path: './websites.csv',
        header: Object.keys(websites[0]).map(key => ({id: key, title: key})),
      });

      await csvWriter.writeRecords(websites)
        .then(() => console.log(`Done writing to websites.csv for ${websites[i]['Root Domain']}`))
        .catch(console.error);
    }
  }
}

main().catch(console.error);