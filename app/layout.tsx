import '@mantine/core/styles.css';

import {
  ColorSchemeScript,
  MantineProvider,
  createTheme,
  mantineHtmlProps,
} from '@mantine/core';

export const metadata = {
  title: 'Evicted',
  description: 'Who finished bottom this week, and have they paid up',
};

const theme = createTheme({
  primaryColor: 'red',
  defaultRadius: 'md',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="dark" />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="dark">
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
