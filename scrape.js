const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const csv = require('fast-csv');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b(?!.*(@.*x.*|\.jpg|\.png|\.jpeg|\.gif|\.bmp|\.svg))/g;

function getTextFromHtml(htmlContent) {
  const $ = cheerio.load(htmlContent);
  $('script').remove();
  $('style').remove();

  function traverse(node) {
    if (node && node.type === 'text') {
      // Add a space before and after the text
      node.data = ' ' + node.data + ' ';
    } else if (node && node.children) {
      node.children.forEach(traverse);
    }
  }

  traverse($('body')[0]);

  return $('body').text();
}

async function crawlWebsite(url) {
  let response;
  try {
    response = await axios.get(url);
  } catch (error) {
    console.error(`Error fetching URL ${url}: ${error.message}`);
    return []; // Return an empty array if there's an error
  }

  const text = await getTextFromHtml(response.data);


  let foundEmails = text.match(EMAIL_REGEX) || [];

  // Extract all internal links
  const $ = cheerio.load(response.data);
  const links = [];
  $('a').each((i, link) => {
    const href = $(link).attr('href');
    if (href && href.startsWith('/') && !href.startsWith('//')) {
      links.push(url + href);
    }
  });

  // Visit each link and check for emails
  for (const link of links) {
    console.log(`Visiting link: ${link}`);  // Log the link
    try {
      response = await axios.get(link);
    } catch (error) {
      console.error(`Error fetching URL ${link}: ${error.message}`);
      continue; // Skip to the next link if there's an error
    }

    const text = await getTextFromHtml(response.data);
    const emails = text.match(EMAIL_REGEX) || [];
    console.log("EMAILS", emails)
    foundEmails.push(...emails);
  }

  // Filter out image URLs
  const imageExtensions = ['.jpg', '.png', '.jpeg', '.gif', '.bmp', '.svg'];
  foundEmails = foundEmails.filter(email => {
    return !imageExtensions.some(extension => email.includes(extension));
  });

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