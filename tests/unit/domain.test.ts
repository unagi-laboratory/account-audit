import { describe, expect, it } from 'vitest';
import { extractAddress, extractDomain, registrableDomain } from '../../src/core/domain';

describe('extractAddress', () => {
  it.each([
    ['Name <User@Example.com>', 'user@example.com'],
    ['user@example.com', 'user@example.com'],
    ['user@example.com (Name)', 'user@example.com'],
    ['"Doe, John" <j@example.org>', 'j@example.org'],
    ['no address here', null],
  ])('%s → %s', (input, expected) => {
    expect(extractAddress(input)).toBe(expected);
  });
});

describe('extractDomain', () => {
  it('ドメイン部分を小文字で返す', () => {
    expect(extractDomain('A <a@Mail.Example.CO.JP>')).toBe('mail.example.co.jp');
  });
});

describe('registrableDomain', () => {
  it.each([
    ['mail.example.co.jp', 'example.co.jp'],
    ['example.co.jp', 'example.co.jp'],
    ['a.b.example.com', 'example.com'],
    ['example.com', 'example.com'],
    ['news.example.co.uk', 'example.co.uk'],
  ])('%s → %s', (input, expected) => {
    expect(registrableDomain(input)).toBe(expected);
  });
});
