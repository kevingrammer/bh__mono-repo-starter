import type { AppProps } from 'next/app';
import CssBaseline from '@mui/material/CssBaseline';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <CssBaseline />
      <Component {...pageProps} />
    </>
  );
}
