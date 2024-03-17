import { BaseTranslate } from './baseTranslate';
import got from 'got';

import {
  ITranslateOptions,
  encodeMarkdownUriComponent,
} from 'comment-translate-manager';
import { load } from 'cheerio';

import { getConfig } from '../configuration';

export class GoogleTranslate extends BaseTranslate {
  override readonly maxLen = 500;
  async _translate(content: string): Promise<string> {
    const [res1, res2] = await Promise.allSettled([
      fetchGoogleTranslate(content),
      fetchPhonetics(content),
    ]);
    const googleTranslate = (res1.status === 'fulfilled' && res1.value) || '';
    const phonetics = res2.status === 'fulfilled' && res2.value;
    let result = googleTranslate;
    if (phonetics) {
      if (phonetics.word.toLowerCase() === content.toLowerCase()) {
        result += `\n${phonetics.phonetics}`;
      } else {
        result += `\n${phonetics.word}\n${phonetics.phonetics}`;
      }
    }
    return result;
  }

  link(
    content: string,
    { to = 'auto', from = 'auto' }: ITranslateOptions
  ): string {
    // [fix] 参数变化zh-cn -> zh-CN。
    // let [first, last] = to.split('-');
    // if (last) {
    //     last = last.toLocaleUpperCase();
    //     to = `${first}-${last}`;
    // }
    let tld = getConfig<string>('googleTranslate.tld', 'com');
    let str = `https://translate.google.${tld}/#view=home&op=translate&sl=${from}&tl=${to}&text=${encodeMarkdownUriComponent(
      content
    )}`;
    let mirror = getConfig<string>('googleTranslate.mirror', '');
    if (mirror !== '') {
      str = `${mirror}/#view=home&op=translate&sl=auto&tl=${to}&text=${encodeMarkdownUriComponent(
        content
      )}`;
    }
    return `[Google](${str})`;
    // return `<a href="${encodeURI(str)}">Google</a>`;
  }
}

const fetchGoogleTranslate = async (content: string) => {
  const res: any = await got(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&hl=zh-CN&dt=t&dt=bd&dj=1&source=icon&tk=753249.753249&q=${content}`,
    {
      timeout: { request: 10000 },
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36',
      },
    }
  ).json();
  const sentences = res.sentences?.map((item: any) => item.trans);
  const dict = res.dict
    ?.map((item: any) => `${item.pos}: ${item.terms.slice(0, 3).join(',')}`)
    .join('\n');
  return dict || sentences;
};

async function fetchPhonetics(content: string) {
  const wordLowcase = content.toLowerCase();
  return new Promise<{
    word: string;
    phonetics: string;
  }>((resolve) => {
    const resolveRequest = async (res: any) => {
      console.log(res);
      const text = await res.text();
      console.log(text);
      const result = resolvePhoneticsResponse(text);
      resolve(result);
    };
    resolveRequest(
      got(
        `https://www.oxfordlearnersdictionaries.com/definition/english/${wordLowcase}?q=${wordLowcase}`,
        {
          timeout: { request: 10000 },
          headers: {
            'user-agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36',
          },
        }
      )
    );
    resolveRequest(
      got(
        `https://www.oxfordlearnersdictionaries.com/search/english/direct/?q=${wordLowcase}`,
        {
          timeout: { request: 10000 },
          headers: {
            'user-agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36',
          },
        }
      )
    );
  });
}

function resolvePhoneticsResponse(text: string) {
  const $ = load(text);
  const phoneticsDoms = $('.top-g > div > span.phonetics .phon');
  const phonetics = Array.from(phoneticsDoms || [])
    .map((item) => {
      return $(item).text();
    })
    .join(' ');
  const headword = ($('h1.headword').prop('firstChild') as any).nodeValue;
  return {
    word: headword,
    phonetics,
  };
}
