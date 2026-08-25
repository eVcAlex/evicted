import '@mantine/core/styles.css';
import './styles/globals.scss';

import { Big_Shoulders, IBM_Plex_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import {
  ColorSchemeScript,
  Container,
  MantineProvider,
  createTheme,
  mantineHtmlProps,
} from '@mantine/core';
import { Header } from './components/layout/Header';
import { MeProvider } from './components/common/MeProvider';
import { ReloadOnResume } from './components/common/ReloadOnResume';

export const metadata = {
  title: 'Evicted',
  description: 'Who finished bottom this week, and have they paid up',
};

/** Display face — condensed and heavy, for headlines and big numerals only. */
const bigShoulders = Big_Shoulders({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-display',
});

/** Body face. */
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-body',
});

/** Reserved narrowly for numbers — scores, dates, stats — agate-column character. */
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-mono',
});

/**
 * Dark ground, card depth, one solid accent — no gradients, no blur, no
 * glow. The `dark` scale is tuned so Mantine's own components (Modal,
 * PasswordInput, Divider) land on the same surface/border tokens the
 * hand-styled components use via the CSS custom properties in globals.scss:
 * dark-9 is --bg, dark-7 is --surface, dark-4 is --border.
 */
const theme = createTheme({
  primaryColor: 'violet',
  defaultRadius: 6,
  fontFamily: 'var(--font-body)',
  headings: { fontFamily: 'var(--font-display)', fontWeight: '800' },
  colors: {
    dark: [
      '#eeece6',
      '#c9c7c1',
      '#a9acb2',
      '#8d9096',
      '#2b2e34',
      '#232529',
      '#1d1f24',
      '#17191d',
      '#131519',
      '#101215',
    ],
    /** The one brand accent — the eviction hero, header rule, marks, tags. */
    violet: [
      '#f3effe',
      '#e0d4fc',
      '#c9b3fa',
      '#b090f7',
      '#9c73f5',
      '#8a58f0',
      '#7c3aed',
      '#6425d1',
      '#4c1d95',
      '#341454',
    ],
    /** Genuine errors/failures only — data unavailable, could not load. */
    red: [
      '#ffe4e6',
      '#ffb8bd',
      '#ff8a92',
      '#f65c66',
      '#e6323f',
      '#d4202d',
      '#c81e2c',
      '#a5161f',
      '#7a0f16',
      '#4a0910',
    ],
    /** Paid / clear. */
    green: [
      '#e6f5ec',
      '#c2e8d2',
      '#9ddab8',
      '#79cc9e',
      '#5fbb87',
      '#4ea973',
      '#4a9c6d',
      '#3c7d58',
      '#2e5e43',
      '#1f3f2d',
    ],
    /** Provisional / owed. */
    yellow: [
      '#faf1de',
      '#f0dcae',
      '#e6c67e',
      '#dcb054',
      '#d29f3d',
      '#c39236',
      '#b98a2e',
      '#966f25',
      '#73541c',
      '#503a13',
    ],
  },
  // Plain config objects, not `Component.extend({...})`. `.extend` is `identity`
  // at runtime (it just hands back what it's given — the real merging happens
  // inside MantineProvider) but the components themselves are client-only
  // exports; calling a static method on them from this Server Component's
  // module scope resolves to an RSC client-reference stub with no `.extend`,
  // not the real component. The object shape is identical either way.
  components: {
    Alert: {
      defaultProps: { radius: 6 },
      styles: {
        root: { fontFamily: 'var(--font-body)' },
        title: {
          fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontSize: 'var(--mantine-font-size-sm)',
        },
      },
    },
    Button: {
      defaultProps: { radius: 6 },
      styles: {
        root: {
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          boxShadow: 'none',
        },
      },
    },
    Modal: {
      defaultProps: { radius: 6 },
      styles: {
        title: {
          fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontWeight: 600,
        },
      },
    },
    PasswordInput: { defaultProps: { radius: 6 } },
  },
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      {...mantineHtmlProps}
      className={`${bigShoulders.variable} ${plusJakarta.variable} ${plexMono.variable}`}
    >
      <head>
        <ColorSchemeScript defaultColorScheme="dark" />
      </head>
      <body>
        <ReloadOnResume />
        <MantineProvider theme={theme} defaultColorScheme="dark">
          <MeProvider>
            <Header />
            <Container size="sm" py="xl">
              {children}
            </Container>
          </MeProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
