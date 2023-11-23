const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const csv = require('fast-csv');
const csvWriter = require('fast-csv').writeToPath;

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
  
  // Write the text to a file
  fs.writeFile('website_text.txt', text, (err) => {
    if (err) throw err;
    console.log('The file has been saved!');
  });

  const foundEmails = text.match(EMAIL_REGEX) || [];

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

  return foundEmails;
}

async function main() {
  const websites = [];
  await new Promise((resolve, reject) => {
    fs.createReadStream('./websites.csv')
      .pipe(csv.parse({ headers: false, skipRows: 2 }))
      .on('data', (row) => {
        websites.push(row[0]); // assuming the website URLs are in the first column
      })
      .on('end', resolve)
      .on('error', reject);
  });

  const results = [];

  // Loop through the websites after all have been read from the CSV
  for (const website of websites) {
    let newWebsite = `http://${website}`
    if (!newWebsite || !(newWebsite.startsWith('http://') || newWebsite.startsWith('https://'))) {
      continue;
    }
    console.log("the website", newWebsite)
    const emails = await crawlWebsite(newWebsite);
    
    console.log(`Website: ${newWebsite}, Emails: ${emails.join(', ')}`);

    // Remove duplicate emails
    const uniqueEmails = [...new Set(emails)];

    // Add the website and emails to the results array
    results.push({ website: newWebsite, emails: uniqueEmails.join(', ') });
  }

  // Write the results to a CSV file
  csvWriter('results.csv', results, { headers: ['website', 'emails'] })
    .on('error', (err) => console.error(err))
    .on('finish', () => console.log('Done writing to results.csv'));
}

main().catch(console.error);