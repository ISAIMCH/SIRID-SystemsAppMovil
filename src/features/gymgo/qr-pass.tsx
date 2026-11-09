import { ActivityIndicator, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ProgressBar } from '@/components/sirid';
import { makeStyles } from '@/theme/make-styles';
import { elevation, radius, space } from '@/theme/tokens';

/** Scanners need dark-on-light: the pass stays ink on white in both themes. */
const QR_INK = '#0C110E';
const QR_PAPER = '#FFFFFF';

const useStyles = makeStyles(({ colors, scheme }) => ({
  pass: { alignSelf: 'center', alignItems: 'center', gap: space.md, borderRadius: radius.xl, backgroundColor: QR_PAPER, padding: space.lg, ...elevation(colors, scheme, 3) },
  code: { alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.3 },
  footer: { alignSelf: 'stretch', gap: 6 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: '#3B4540', fontSize: 13, fontWeight: '600' },
  countdown: { color: QR_INK, fontSize: 15, fontWeight: '700', fontFamily: 'display', fontVariant: ['tabular-nums'] },
  track: { backgroundColor: '#E8ECE7' },
}));

export function QrPass({ token, remaining, total, size = 240, loading = false, dimmed = false }: {
  token: string | null;
  remaining: number;
  total: number;
  size?: number;
  loading?: boolean;
  dimmed?: boolean;
}) {
  const styles = useStyles();
  const valid = Boolean(token) && remaining > 0;
  return (
    <View
      accessible
      accessibilityLabel={valid ? `Código de acceso vigente, ${remaining} segundos restantes` : 'Generando código de acceso'}
      style={styles.pass}>
      <View style={[styles.code, { width: size, height: size }, dimmed && styles.dimmed]}>
        {valid && token ? <QRCode value={token} size={size} quietZone={6} color={QR_INK} backgroundColor={QR_PAPER} /> : <ActivityIndicator color={QR_INK} size="large" />}
      </View>
      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <View style={styles.status}>
            <View style={[styles.dot, { backgroundColor: valid ? '#00B862' : '#E8A317' }]} />
            <Text style={styles.statusText}>{valid ? 'Código vigente' : loading ? 'Generando…' : 'Renovando código'}</Text>
          </View>
          {valid ? <Text style={styles.countdown}>{remaining}s</Text> : null}
        </View>
        <ProgressBar value={valid && total > 0 ? remaining / total : 0} height={4} color="#00B862" style={styles.track} />
      </View>
    </View>
  );
}
