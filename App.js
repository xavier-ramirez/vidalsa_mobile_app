import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  SafeAreaView, StatusBar, FlatList, ActivityIndicator,
  Alert, ScrollView, Modal, RefreshControl, Platform, Image, Dimensions
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import { MaterialIcons } from '@expo/vector-icons';


// Logo local (no depende del servidor)
const LOGO_LOCAL = require('./assets/logo.webp');

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
// La IP se guarda en el teléfono y se puede cambiar desde la app.
// Por defecto intenta con la IP conocida del servidor.
const DEFAULT_IP = '192.168.250.4:8000';

async function getApiBase() {
  const saved = await AsyncStorage.getItem('server_ip');
  let ip = (saved && saved.trim()) ? saved.trim() : DEFAULT_IP;

  // Quitar http:// o https:// si el usuario lo escribió (lo ponemos nosotros)
  ip = ip.replace(/^https?:\/\//i, '');
  // Quitar barras al final: 192.168.250.4:8000/ → 192.168.250.4:8000
  ip = ip.replace(/\/+$/, '');

  return `http://${ip}/api/mobile`;
}

// ─── COLORES ──────────────────────────────────────────────────────────────────
const C = {
  darkBg:   '#0f172a',
  navyBg:   '#1e293b',
  blue:     '#2563eb',
  green:    '#10b981',
  orange:   '#f59e0b',
  red:      '#ef4444',
  textPrim: '#1e293b',
  textSec:  '#64748b',
  border:   '#e2e8f0',
  bgLight:  '#f8fafc',
  white:    '#ffffff',
};

// ─── BASE DE DATOS SQLITE ─────────────────────────────────────────────────────
let db = null;

async function getDb() {
  if (!db) {
    db = await SQLite.openDatabaseAsync('vidalsa.db');
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS equipos (
        id_equipo     INTEGER PRIMARY KEY,
        codigo_patio  TEXT,
        tipo          TEXT,
        marca         TEXT,
        modelo        TEXT,
        anio          TEXT,
        categoria     TEXT,
        serial_chasis TEXT,
        serial_motor  TEXT,
        nro_etiqueta  TEXT,
        estado        TEXT,
        placa         TEXT,
        frente        TEXT,
        detalle_ubi   TEXT,
        confirmado    INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS frentes (
        id_frente   INTEGER PRIMARY KEY,
        nombre      TEXT,
        tipo        TEXT,
        ubicacion   TEXT
      );

      CREATE TABLE IF NOT EXISTS movilizaciones_pendientes (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo_mov        TEXT,
        id_equipo       INTEGER,
        id_frente_dest  INTEGER,
        detalle_ubi     TEXT,
        ids_equipos     TEXT,
        creado_en       TEXT,
        sincronizado    INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS meta (
        clave TEXT PRIMARY KEY,
        valor TEXT
      );
    `);
  }
  return db;
}

// Guardar equipos en SQLite
async function guardarEquiposLocal(equipos) {
  const database = await getDb();
  await database.runAsync('DELETE FROM equipos');
  for (const eq of equipos) {
    await database.runAsync(
      `INSERT INTO equipos VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        eq.ID_EQUIPO, eq.CODIGO_PATIO || '', eq.TIPO || '',
        eq.MARCA || '', eq.MODELO || '', eq.ANIO || '', eq.CATEGORIA_FLOTA || '',
        eq.SERIAL_CHASIS || '', eq.SERIAL_MOTOR || '', eq.NUMERO_ETIQUETA || '',
        eq.ESTADO_OPERATIVO || '', eq.PLACA || '', eq.FRENTE_ACTUAL || '',
        eq.DETALLE_UBICACION || '', eq.CONFIRMADO || 0,
      ]
    );
  }
  await database.runAsync(
    `INSERT OR REPLACE INTO meta VALUES ('ultima_sincronizacion', ?)`,
    [new Date().toISOString()]
  );
}

// Guardar frentes en SQLite
async function guardarFrentesLocal(frentes) {
  const database = await getDb();
  await database.runAsync('DELETE FROM frentes');
  for (const f of frentes) {
    await database.runAsync(
      `INSERT INTO frentes VALUES (?,?,?,?)`,
      [f.ID_FRENTE, f.NOMBRE_FRENTE || '', f.TIPO_FRENTE || '', f.UBICACION || '']
    );
  }
}

// Leer equipos desde SQLite
async function leerEquiposLocal(busqueda = '') {
  const database = await getDb();
  const q = `%${busqueda.toUpperCase()}%`;
  if (!busqueda) {
    return await database.getAllAsync('SELECT * FROM equipos ORDER BY codigo_patio ASC');
  }
  return await database.getAllAsync(
    `SELECT * FROM equipos WHERE
      UPPER(codigo_patio) LIKE ? OR UPPER(marca) LIKE ? OR UPPER(modelo) LIKE ?
      OR UPPER(serial_chasis) LIKE ? OR UPPER(frente) LIKE ? OR UPPER(placa) LIKE ?
     ORDER BY codigo_patio ASC`,
    [q, q, q, q, q, q]
  );
}

// Leer frentes desde SQLite
async function leerFrentesLocal() {
  const database = await getDb();
  return await database.getAllAsync('SELECT * FROM frentes ORDER BY nombre ASC');
}

// Guardar movilización pendiente (offline)
async function guardarMovPendiente(datos) {
  const database = await getDb();
  await database.runAsync(
    `INSERT INTO movilizaciones_pendientes
      (tipo_mov, id_equipo, id_frente_dest, detalle_ubi, ids_equipos, creado_en)
     VALUES (?,?,?,?,?,?)`,
    [
      datos.tipo || 'despacho',
      datos.id_equipo || null,
      datos.id_frente_dest || null,
      datos.detalle_ubi || '',
      datos.ids_equipos || '',
      new Date().toISOString(),
    ]
  );
}

// Leer pendientes sin sincronizar
async function leerPendientes() {
  const database = await getDb();
  return await database.getAllAsync(
    'SELECT * FROM movilizaciones_pendientes WHERE sincronizado = 0'
  );
}

// Marcar pendiente como sincronizado
async function marcarSincronizado(id) {
  const database = await getDb();
  await database.runAsync(
    'UPDATE movilizaciones_pendientes SET sincronizado = 1 WHERE id = ?', [id]
  );
}

// Leer fecha de última sincronización
async function leerUltimaSincronizacion() {
  const database = await getDb();
  const r = await database.getFirstAsync(
    "SELECT valor FROM meta WHERE clave = 'ultima_sincronizacion'"
  );
  return r ? r.valor : null;
}

// ─── API HELPER ───────────────────────────────────────────────────────────────
async function api(method, path, body = null) {
  const apiBase = await getApiBase();
  const token = await AsyncStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${apiBase}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Error ${res.status}`);
  return data;
}

// ─── COMPONENTES COMPARTIDOS ──────────────────────────────────────────────────
// Logo usa asset local para funcionar sin conexión
function LogoVidalsa({ size = 40 }) {
  return <Image source={LOGO_LOCAL} style={{ height: size, maxWidth: '90%', width: size * 5.5, resizeMode: 'contain' }} />;
}

function TopHeader({ onOpenMenu }) {
  return (
    <View style={styles.topHeaderPremium}>
      <LogoVidalsa size={32} />
      <TouchableOpacity onPress={onOpenMenu} style={{ padding: 8 }}>
        <MaterialIcons name="menu" size={28} color="#0067b1" />
      </TouchableOpacity>
    </View>
  );
}

// Helper para ítem del menú con MaterialIcons
function MenuItem({ icon, label, onPress, color = '#334155', subItem = false }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.menuItem,
        subItem && { paddingVertical: 10, paddingLeft: 4 }
      ]}
      activeOpacity={0.7}
    >
      <MaterialIcons name={icon} size={subItem ? 20 : 22} color={color} style={{ width: 32 }} />
      <Text style={[styles.menuItemText, { color, fontSize: subItem ? 14 : 15 }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function DrawerMenu({ visible, onClose, onNavigate, onLogout, user }) {
  const { width } = Dimensions.get('window');
  const [configOpen, setConfigOpen] = useState(false);
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* Fondo oscuro al tap cierra */}
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={onClose} activeOpacity={1} />

        {/* Panel deslizante */}
        <View style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: width * 0.78, backgroundColor: '#ffffff',
          paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 20 : 50, elevation: 20,
          shadowColor: '#000', shadowOffset: { width: -4, height: 0 }, shadowOpacity: 0.15, shadowRadius: 12
        }}>
          {/* Logo + usuario */}
          <View style={{ paddingHorizontal: 20, paddingBottom: 16, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
            <LogoVidalsa size={30} />
            {user && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 }}>
                <MaterialIcons name="account-circle" size={18} color="#64748b" />
                <Text style={{ fontSize: 12, color: '#64748b' }} numberOfLines={1}>
                  {user.name || user.email || 'Usuario'}
                </Text>
              </View>
            )}
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>

              {/* Inicio — igual que web: "home" */}
              <MenuItem icon="home" label="Inicio" onPress={() => { onNavigate('dashboard'); onClose(); }} />

              {/* Vehículo — igual que web: "agriculture" */}
              <MenuItem icon="agriculture" label="Vehículo" onPress={() => { onNavigate('equipos'); onClose(); }} />

              {/* Recepción — igual que web: "local-shipping" */}
              <MenuItem icon="local-shipping" label="Recepción" onPress={() => { onNavigate('movs'); onClose(); }} />

              {/* Divisor */}
              <View style={{ height: 1, backgroundColor: '#f1f5f9', marginVertical: 8 }} />

              {/* Configuraciones — igual que web: "settings" */}
              <TouchableOpacity
                onPress={() => setConfigOpen(!configOpen)}
                style={[styles.menuItem, { justifyContent: 'space-between' }]}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialIcons name="settings" size={22} color="#334155" style={{ width: 32 }} />
                  <Text style={styles.menuItemText}>Configuraciones</Text>
                </View>
                <MaterialIcons name={configOpen ? 'expand-less' : 'expand-more'} size={20} color="#94a3b8" />
              </TouchableOpacity>

              {configOpen && (
                <View style={{ marginLeft: 20, borderLeftWidth: 2, borderLeftColor: '#e2e8f0', paddingLeft: 8, marginBottom: 4 }}>
                  {/* Usuarios — igual que web: "people" */}
                  <MenuItem icon="people" label="Usuarios" onPress={onClose} subItem />
                  {/* Frentes — igual que web: "business" */}
                  <MenuItem icon="business" label="Frentes de Trabajo" onPress={onClose} subItem />
                  {/* Catálogo — igual que web: "menu-book" */}
                  <MenuItem icon="menu-book" label="Catálogo de Modelos" onPress={onClose} subItem />
                </View>
              )}

              {/* Consumibles — igual que web: "local-gas-station" */}
              <MenuItem icon="local-gas-station" label="Consumibles" onPress={onClose} />

              {/* Secciones adicionales según la web */}
              <MenuItem icon="dashboard" label="Sección 5" onPress={onClose} />
              <MenuItem icon="analytics" label="Sección 6" onPress={onClose} />
              <MenuItem icon="inventory" label="Sección 7" onPress={onClose} />

              <View style={{ height: 40 }} />

              {/* Cerrar Sesión — igual que web: "logout" */}
              <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 16, marginBottom: 30 }}>
                <MenuItem icon="logout" label="Cerrar Sesión" onPress={() => { onClose(); setTimeout(onLogout, 250); }} color="#ef4444" />
              </View>

            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}


// ─── PANTALLA DE LOGIN ────────────────────────────────────────────────────────
function PantallaLogin({ onLogin }) {
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [ultimaSync, setUltimaSync] = useState('');
  const [conteoLocal, setConteoLocal] = useState(0);
  const [serverIp, setServerIp] = useState('');
  const [mostrarIp, setMostrarIp] = useState(false);
  const [mostrarFormLogin, setMostrarFormLogin] = useState(false);

  useEffect(() => {
    (async () => {
      const fecha = await leerUltimaSincronizacion();
      if (fecha) {
        const d = new Date(fecha);
        setUltimaSync(d.toLocaleString('es-VE'));
      }
      const equipos = await leerEquiposLocal();
      setConteoLocal(equipos.length);
      const ip = await AsyncStorage.getItem('server_ip');
      if (ip) setServerIp(ip);
      else setServerIp(DEFAULT_IP);
      // Si NO hay datos locales, mostrar formulario de login directamente
      if (equipos.length === 0) setMostrarFormLogin(true);
    })();
  }, []);

  const guardarIp = async () => {
    const ipLimpia = serverIp.trim().replace(/\/+$/, '');
    if (!ipLimpia) { Alert.alert('Error', 'Escribe una IP o dirección válida.'); return; }
    await AsyncStorage.setItem('server_ip', ipLimpia);
    setMostrarIp(false);
    Alert.alert('✅ Guardado', `Servidor configurado: ${ipLimpia}\n\nAhora intenta descargar los datos.`);
  };

  const descargarDatos = async () => {
    setDescargando(true);
    try {
      const [equipos, frentes] = await Promise.all([
        api('GET', '/equipos'),
        api('GET', '/frentes'),
      ]);
      await guardarEquiposLocal(equipos);
      await guardarFrentesLocal(frentes);
      const fecha = new Date();
      setUltimaSync(fecha.toLocaleString('es-VE'));
      setConteoLocal(equipos.length);
      Alert.alert(
        '✅ Descarga Exitosa',
        `Se guardaron ${equipos.length} equipos y ${frentes.length} frentes.\n\nYa puedes trabajar sin internet.`
      );
    } catch (e) {
      Alert.alert(
        '❌ Sin Conexión',
        'No se pudo conectar al servidor. Verifica que estás en la misma red WiFi.\n\nDetalle: ' + e.message
      );
    } finally {
      setDescargando(false);
    }
  };

  // ─── Modo offline: entrar sin servidor si hay datos locales ───
  const entrarSinConexion = async () => {
    try {
      // Intentar recuperar último usuario guardado
      const savedUser = await AsyncStorage.getItem('user');
      if (savedUser) {
        onLogin(JSON.parse(savedUser));
        return;
      }
      // Si no hay usuario guardado, crear uno local básico
      const usuarioOffline = { name: 'Modo Offline', email: 'offline@local', offline: true };
      await AsyncStorage.setItem('user', JSON.stringify(usuarioOffline));
      await AsyncStorage.setItem('token', 'offline_token');
      onLogin(usuarioOffline);
    } catch (e) {
      Alert.alert('Error', 'No se pudo entrar en modo offline: ' + e.message);
    }
  };

  const handleLogin = async () => {
    if (!correo.trim() || !password.trim()) {
      Alert.alert('Campos vacíos', 'Ingresa tu correo y contraseña.');
      return;
    }
    setLoading(true);
    try {
      const data = await api('POST', '/login', { correo: correo.trim(), password });
      await AsyncStorage.setItem('token', data.token);
      await AsyncStorage.setItem('user', JSON.stringify(data.user));
      // Descargar datos automáticamente tras login exitoso
      try {
        const [equipos, frentes] = await Promise.all([
          api('GET', '/equipos'),
          api('GET', '/frentes'),
        ]);
        await guardarEquiposLocal(equipos);
        await guardarFrentesLocal(frentes);
      } catch (_) {
        // Si falla la descarga post-login, continúa con datos locales existentes
      }
      onLogin(data.user);
    } catch (e) {
      Alert.alert('Error de acceso', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fdfbfb' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fdfbfb" />
      {/* Curva lateral azul — igual que la web */}
      <View style={styles.blueCurveDashboard} />

      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}>

        {/* ── Tarjeta de Login ── */}
        <View style={styles.loginCardPremium}>
          {/* Logo local — no depende de internet */}
          <View style={{ alignItems: 'center', marginBottom: 24, marginTop: 6 }}>
            <LogoVidalsa size={70} />
          </View>

          {/* ── Modo Offline: botón principal si hay datos ── */}
          {conteoLocal > 0 && !mostrarFormLogin && (
            <View style={{ alignItems: 'center' }}>
              {/* Info de datos locales */}
              <View style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, width: '100%', marginBottom: 16, borderWidth: 1, borderColor: '#bbf7d0' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#166534', textAlign: 'center' }}>
                  📦 {conteoLocal} equipos disponibles offline
                </Text>
                {ultimaSync ? (
                  <Text style={{ fontSize: 11, color: '#4ade80', textAlign: 'center', marginTop: 3 }}>
                    Última sincronización: {ultimaSync}
                  </Text>
                ) : null}
              </View>

              {/* BOTÓN PRINCIPAL: Continuar sin conexión */}
              <TouchableOpacity
                style={{ backgroundColor: '#00004d', borderRadius: 12, paddingVertical: 16, width: '100%', alignItems: 'center', marginBottom: 12, elevation: 4, shadowColor: '#000', shadowOffset: {width:0,height:3}, shadowOpacity: 0.2, shadowRadius: 6 }}
                onPress={entrarSinConexion}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialIcons name="wifi-off" size={20} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Continuar sin conexión</Text>
                </View>
              </TouchableOpacity>

              {/* Botón secundario: iniciar sesión con servidor */}
              <TouchableOpacity
                style={{ backgroundColor: 'transparent', borderRadius: 12, paddingVertical: 12, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e0' }}
                onPress={() => setMostrarFormLogin(true)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialIcons name="wifi" size={16} color="#64748b" />
                  <Text style={{ color: '#64748b', fontWeight: '600', fontSize: 14 }}>Iniciar sesión con servidor</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Formulario de Login (online) ── */}
          {mostrarFormLogin && (
            <>
              {conteoLocal > 0 && (
                <TouchableOpacity onPress={() => setMostrarFormLogin(false)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 4 }}>
                  <MaterialIcons name="arrow-back" size={16} color="#64748b" />
                  <Text style={{ color: '#64748b', fontSize: 13 }}>Volver al modo offline</Text>
                </TouchableOpacity>
              )}

              <View style={styles.inputContainerPremium}>
                <Text style={styles.floatingLabel}>Correo corporativo</Text>
                <TextInput
                  style={styles.inputPremium}
                  placeholder="usuario@cvidalsa27.com"
                  placeholderTextColor="#94a3b8"
                  value={correo}
                  onChangeText={setCorreo}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>

              <View style={styles.inputContainerPremium}>
                <Text style={styles.floatingLabel}>Contraseña</Text>
                <TextInput
                  style={styles.inputPremium}
                  placeholder="••••••••"
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity
                style={[styles.btnPremium, loading && { opacity: 0.7 }]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color={C.white} />
                  : <Text style={styles.btnPremiumText}>Iniciar sesión</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Sección Offline / Descarga ── */}
        <View style={{ marginTop: 40, alignItems: 'center' }}>
          <TouchableOpacity
            style={[styles.btnDownload, descargando && { opacity: 0.6 }, { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.4)', borderWidth: 1 }]}
            onPress={descargarDatos}
            disabled={descargando}
          >
            {descargando
              ? <ActivityIndicator color={C.white} />
              : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialIcons name="cloud-download" size={16} color="#fff" />
                  <Text style={styles.btnDownloadText}>Descargar / Actualizar datos</Text>
                </View>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setMostrarIp(!mostrarIp)} style={{ marginTop: 16 }}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
              ⚙️ Servidor: {serverIp || DEFAULT_IP}
            </Text>
          </TouchableOpacity>

          {mostrarIp && (
            <View style={styles.ipBox}>
              <TextInput style={styles.ipInput} placeholder={DEFAULT_IP} placeholderTextColor="#6ee7b7" value={serverIp} onChangeText={setServerIp} autoCapitalize="none" keyboardType="url" />
              <TouchableOpacity style={styles.btnSaveIp} onPress={guardarIp}>
                <Text style={styles.btnSaveIpText}>Guardar Servidor</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}



// ─── BADGE DE ESTADO ─────────────────────────────────────────────────────────
function BadgeEstado({ estado }) {
  const map = {
    'OPERATIVO':        { bg: '#dcfce7', color: '#166534' },
    'INOPERATIVO':      { bg: '#fee2e2', color: '#991b1b' },
    'EN MANTENIMIENTO': { bg: '#fef9c3', color: '#854d0e' },
  };
  const s = map[estado] || { bg: '#e2e8f0', color: '#475569' };
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.badgeText, { color: s.color }]}>{estado || 'N/A'}</Text>
    </View>
  );
}

// ─── PANTALLA DASHBOARD ─────────────────────────────────────────────────────────
function PantallaDashboard({ onOpenMenu, equiposCount }) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <TopHeader onOpenMenu={onOpenMenu} />
      
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 15, paddingBottom: 15 }}>
            <Text style={[styles.dashboardTitle, {fontSize: 22, marginTop: 0, marginBottom: 5, textAlign: 'left'}]}>Sistema de Gestión de{'\n'}Equipos Operacionales</Text>
        </View>
        <View style={styles.dashboardWidgetGroup}>
          <View style={styles.widgetPremium}>
            <View style={[styles.widgetIconBox, { backgroundColor: '#dbeafe' }]}>
              <Text style={{ fontSize: 24, color: '#1e3a8a' }}>🚛</Text>
            </View>
            <View style={{ marginLeft: 15, flex: 1 }}>
              <Text style={{ color: '#64748b', fontSize: 13, fontWeight: '600' }}>Por Confirmar</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 5 }}>
                <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#0f172a', lineHeight: 32 }}>0</Text>
                <Text style={{ fontSize: 13, color: '#94a3b8', marginLeft: 8, marginBottom: 4 }}>| 0 Moviliz. Hoy</Text>
              </View>
            </View>
          </View>

          <View style={styles.widgetPremium}>
            <View style={[styles.widgetIconBox, { backgroundColor: '#fef3c7' }]}>
              <Text style={{ fontSize: 24, color: '#d97706' }}>🔔</Text>
            </View>
            <View style={{ marginLeft: 15, flex: 1 }}>
              <Text style={{ color: '#64748b', fontSize: 13, fontWeight: '600' }}>Alertas Documentos</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 5 }}>
                <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#0f172a', lineHeight: 32 }}>79</Text>
                <Text style={{ fontSize: 13, color: '#0f172a', fontWeight: '700', marginLeft: 8, marginBottom: 4 }}>| Por Renovar</Text>
              </View>
            </View>
          </View>

          <View style={styles.widgetPremium}>
            <View style={[styles.widgetIconBox, { backgroundColor: '#f1f5f9' }]}>
              <Text style={{ fontSize: 24 }}>📱</Text>
            </View>
            <View style={{ marginLeft: 15, flex: 1 }}>
              <Text style={{ color: '#64748b', fontSize: 13, fontWeight: '600' }}>Equipos Offline Guardados</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 5 }}>
                <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#0f172a', lineHeight: 32 }}>{equiposCount}</Text>
                <Text style={{ fontSize: 13, color: '#94a3b8', marginLeft: 8, marginBottom: 4 }}>| Sincronizados</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── PANTALLA DE EQUIPOS ──────────────────────────────────────────────────────
function PantallaEquipos({ user, onOpenMenu }) {
  const [equipos, setEquipos]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [busqueda, setBusqueda]       = useState('');
  const [filtroFrente, setFiltroFrente] = useState('');
  const [filtroTipo, setFiltroTipo]   = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [equipoSel, setEquipoSel]     = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [stats, setStats]             = useState({ total: 0, inoperativos: 0, mantenimiento: 0 });

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      let data = await leerEquiposLocal(busqueda);
      if (filtroFrente) data = data.filter(e => String(e.frente || '').toLowerCase().includes(filtroFrente.toLowerCase()));
      if (filtroTipo)   data = data.filter(e => String(e.tipo || '').toLowerCase().includes(filtroTipo.toLowerCase()));
      
      setStats({
        total: data.length,
        inoperativos: data.filter(e => e.estado === 'INOPERATIVO').length,
        mantenimiento: data.filter(e => e.estado === 'EN MANTENIMIENTO').length,
      });

      if (filtroEstado) data = data.filter(e => e.estado === filtroEstado);
      setEquipos(data);
    } catch (_) {
      Alert.alert('Error', 'No se pudo leer los datos locales.');
    } finally {
      setLoading(false);
    }
  }, [busqueda, filtroFrente, filtroTipo, filtroEstado]);

  useEffect(() => { cargar(); }, [cargar]);

  // Status map — matches web icons exactly
  const estadoMap = {
    OPERATIVO:          { color: '#16a34a', icon: 'check-circle',  label: 'Operativo' },
    INOPERATIVO:        { color: '#dc2626', icon: 'cancel',        label: 'Inoperativo' },
    'EN MANTENIMIENTO': { color: '#d97706', icon: 'engineering',   label: 'Mantenimiento' },
    DESINCORPORADO:     { color: '#475569', icon: 'archive',       label: 'Desincorporado' },
  };
  const getEstado = (e) => estadoMap[e] || { color: '#475569', icon: 'help', label: e || 'N/A' };

  const renderItem = ({ item }) => {
    const est = getEstado(item.estado);
    return (
      <View style={styles.equipoCard}>
        {/* TOP ROW: Frente (small upper left) */}
        <View style={{ marginBottom: 10 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.3 }} numberOfLines={2}>
            {item.frente || 'SIN ASIGNAR'}
          </Text>
        </View>

        {/* BODY: image placeholder (left) + data column (right) */}
        <View style={{ flexDirection: 'row', gap: 18, alignItems: 'flex-start' }}>
          {/* placeholder igual al web: mas grande */}
          <View style={{ width: 85, height: 85, backgroundColor: '#f8fafc', borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}>
            <MaterialIcons name="image-not-supported" size={34} color="#cbd5e1" />
          </View>
          {/* Datos igual al web: uno debajo del otro alineados */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#000', textTransform: 'uppercase', marginBottom: 2 }}>{item.tipo || '—'}</Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f172a', marginBottom: 1 }}>{item.marca || '—'}</Text>
            <Text style={{ fontSize: 13, color: '#718096', marginBottom: 6 }}>{item.modelo || '—'}</Text>
            {item.serial_chasis ? <Text style={styles.serialLine}><Text style={styles.serialKey}>S: </Text>{item.serial_chasis}</Text> : null}
            {item.serial_motor  ? <Text style={styles.serialLine}><Text style={styles.serialKey}>M: </Text>{item.serial_motor}</Text>  : null}
            {item.placa && item.placa !== 'S/P'
              ? <Text style={[styles.serialLine, { color: '#0067b1' }]}><Text style={[styles.serialKey, { color: '#0067b1' }]}>P: </Text>{item.placa}</Text>
              : <Text style={{ fontSize: 12, color: '#a0aec0', fontStyle: 'italic', marginVertical: 2 }}>Sin Placa</Text>
            }
            <Text style={{ fontSize: 12, color: '#2d3748', fontWeight: '600', marginTop: 4 }}>
              <Text style={{ fontWeight: '800' }}>ID: </Text>{item.codigo_patio || '—'}
            </Text>
          </View>
        </View>

        {/* FOOTER: status pill (icon + label + chevron) + dark navy eye button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, gap: 10 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff', gap: 6 }}>
            <MaterialIcons name={est.icon} size={16} color={est.color} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155', flex: 1 }}>{est.label}</Text>
            <MaterialIcons name="expand-more" size={18} color="#94a3b8" />
          </View>
          <TouchableOpacity
            style={{ backgroundColor: '#00004d', borderRadius: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => { setEquipoSel(item); setModalVisible(true); }}
          >
            <MaterialIcons name="visibility" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <TopHeader onOpenMenu={onOpenMenu} />

      {/* Título */}
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, backgroundColor: '#fff' }}>
        <Text style={{ fontSize: 20, fontWeight: '900', color: '#0f172a' }}>Gestión de Equipos y Maquinaria</Text>
      </View>

      {/* Filtros + Acciones + Consolidado — igual web responsive */}
      <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 8 }}>

        {/* Filtrar Frente */}
        <View style={[styles.filterPill, filtroFrente ? { borderColor: '#0067b1', backgroundColor: '#e1effa' } : {}]}>
          <MaterialIcons name="search" size={18} color="#94a3b8" style={{ marginRight: 4 }} />
          <TextInput
            style={{ flex: 1, fontSize: 13, color: '#1e293b', paddingVertical: 0 }}
            placeholder="Filtrar Frente..."
            placeholderTextColor="#94a3b8"
            value={filtroFrente}
            onChangeText={setFiltroFrente}
          />
          {filtroFrente ? (
            <TouchableOpacity onPress={() => setFiltroFrente('')}>
              <MaterialIcons name="close" size={18} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filtrar Tipo */}
        <View style={[styles.filterPill, filtroTipo ? { borderColor: '#0067b1', backgroundColor: '#e1effa' } : {}]}>
          <MaterialIcons name="search" size={18} color="#94a3b8" style={{ marginRight: 4 }} />
          <TextInput
            style={{ flex: 1, fontSize: 13, color: '#1e293b', paddingVertical: 0 }}
            placeholder="Filtrar Tipo..."
            placeholderTextColor="#94a3b8"
            value={filtroTipo}
            onChangeText={setFiltroTipo}
          />
          {filtroTipo ? (
            <TouchableOpacity onPress={() => setFiltroTipo('')}>
              <MaterialIcons name="close" size={18} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Buscar Seriales + botón filter_list */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={[styles.filterPill, { flex: 1 }]}>
            <MaterialIcons name="search" size={18} color="#94a3b8" style={{ marginRight: 4 }} />
            <TextInput
              style={{ flex: 1, fontSize: 13, color: '#1e293b', paddingVertical: 0 }}
              placeholder="Buscar Seriales"
              placeholderTextColor="#94a3b8"
              value={busqueda}
              onChangeText={setBusqueda}
            />
            {busqueda
              ? <TouchableOpacity onPress={() => setBusqueda('')}><MaterialIcons name="close" size={18} color="#94a3b8" /></TouchableOpacity>
              : null}
          </View>
          {/* Botón filtro avanzado (ilustrativo) */}
          <View style={{ width: 45, height: 45, borderWidth: 1, borderColor: '#cbd5e0', borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fbfcfd' }}>
            <MaterialIcons name="filter-list" size={22} color="#64748b" />
          </View>
        </View>

        {/* Botón Acciones — azul con engranaje + chevron, igual al web */}
        <TouchableOpacity style={{ backgroundColor: '#0067b1', borderRadius: 12, height: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <MaterialIcons name="settings" size={20} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Acciones</Text>
          <MaterialIcons name="expand-more" size={20} color="#fff" />
        </TouchableOpacity>

        {/* CONSOLIDADO DE EQUIPOS — barra azul oscura igual que la web */}
        <View style={{ backgroundColor: '#1e293b', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <MaterialIcons name="pie-chart" size={13} color="rgba(255,255,255,0.65)" />
          <Text style={{ fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>Consolidado de Equipos</Text>
          {/* TOTAL */}
          <TouchableOpacity onPress={() => setFiltroEstado('')} style={[{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }, filtroEstado === '' && { backgroundColor: '#3b82f6', borderColor: '#60a5fa', borderWidth: 1 }]}>
            <Text style={[{ color: '#fff', fontWeight: '800', fontSize: 13 }, filtroEstado === '' && { color: '#fff' }]}>{stats.total} <Text style={{ fontWeight: '600', fontSize: 11 }}>TOTAL</Text></Text>
          </TouchableOpacity>
          {/* Inoperativos */}
          <TouchableOpacity onPress={() => setFiltroEstado('INOPERATIVO')} style={[{ backgroundColor: 'rgba(239,68,68,0.18)', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }, filtroEstado === 'INOPERATIVO' && { backgroundColor: 'rgba(239,68,68,0.9)' }]}>
            <MaterialIcons name="cancel" size={13} color={filtroEstado === 'INOPERATIVO' ? '#fff' : '#f87171'} />
            <Text style={[{ color: '#f87171', fontWeight: '700', fontSize: 11 }, filtroEstado === 'INOPERATIVO' && { color: '#fff' }]}>{stats.inoperativos} Inoperativos</Text>
          </TouchableOpacity>
          {/* Mantenimiento */}
          <TouchableOpacity onPress={() => setFiltroEstado('EN MANTENIMIENTO')} style={[{ backgroundColor: 'rgba(245,158,11,0.18)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }, filtroEstado === 'EN MANTENIMIENTO' && { backgroundColor: 'rgba(245,158,11,0.9)' }]}>
            <MaterialIcons name="engineering" size={13} color={filtroEstado === 'EN MANTENIMIENTO' ? '#fff' : '#fbbf24'} />
            <Text style={[{ color: '#fbbf24', fontWeight: '700', fontSize: 11 }, filtroEstado === 'EN MANTENIMIENTO' && { color: '#fff' }]}>{stats.mantenimiento}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Lista de Tarjetas */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.blue} />
          <Text style={styles.loadingText}>Cargando equipos...</Text>
        </View>
      ) : (
        <FlatList
          data={equipos}
          keyExtractor={(item) => String(item.id_equipo)}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={[styles.centered, { paddingVertical: 60 }]}>
              <MaterialIcons name="filter-alt" size={48} color="#cbd5e0" />
              <Text style={[styles.emptyText, { marginTop: 10, textAlign: 'center' }]}>
                {busqueda || filtroFrente || filtroTipo
                  ? 'Sin resultados con estos filtros.'
                  : 'Seleccione un filtro para ver los equipos.'}
              </Text>
            </View>
          }
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
        />
      )}

      {/* ── Modal de Detalles (igual que web) ── */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { maxHeight: '92%' }]}>
            {equipoSel && (
              <>
                {/* Header azul oscuro: CASILLERO + Placa / Serial (igual que la web) */}
                <View style={{ backgroundColor: '#00004d', paddingHorizontal: 22, paddingVertical: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 0.5 }}>CASILLERO</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 }}>
                      Placa: {equipoSel.placa || 'S/P'} - Serial: {equipoSel.serial_chasis || 'S/S'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setModalVisible(false)}
                    style={{ backgroundColor: 'rgba(255,255,255,0.15)', width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontSize: 18, lineHeight: 20 }}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ padding: 16 }} contentContainerStyle={{ paddingBottom: 10 }}>
                  <AccordionSection title="📄 Documentación Legal y Soportes" initialOpen={true}>
                    <DetalleRow label="Titular del Registro" valor={equipoSel.propietario} />
                    <DetalleRow label="Placa Identificadora" valor={equipoSel.placa} />
                    <View style={styles.detalleRow}>
                      <Text style={styles.detalleLabel}>Nro. Documento</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={styles.detalleValor}>{equipoSel.nro_documento || '—'}</Text>
                        <MaterialIcons name="picture-as-pdf" size={20} color="#94a3b8" />
                      </View>
                    </View>
                    <View style={styles.detalleRow}>
                      <Text style={styles.detalleLabel}>Póliza de Seguro</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={styles.detalleValor}>N/A</Text>
                        <MaterialIcons name="cloud-upload" size={20} color="#3b82f6" />
                      </View>
                    </View>
                    <View style={styles.detalleRow}>
                      <Text style={styles.detalleLabel}>Registro ROTC</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={styles.detalleValor}>N/A</Text>
                        <MaterialIcons name="cloud-upload" size={20} color="#3b82f6" />
                      </View>
                    </View>
                    <View style={styles.detalleRow}>
                      <Text style={styles.detalleLabel}>Registro RACDA</Text>
                       <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={styles.detalleValor}>N/A</Text>
                        <MaterialIcons name="cloud-upload" size={20} color="#3b82f6" />
                      </View>
                    </View>
                  </AccordionSection>
                  
                  <AccordionSection title="ℹ️ Información General" initialOpen={false}>
                    <DetalleRow label="Tipo"          valor={equipoSel.tipo} />
                    <DetalleRow label="Marca"         valor={equipoSel.marca} />
                    <DetalleRow label="Modelo"        valor={equipoSel.modelo} />
                    <DetalleRow label="Año"           valor={equipoSel.anio} />
                    <DetalleRow label="Categoría"     valor={equipoSel.categoria} />
                    <DetalleRow label="Frente"        valor={equipoSel.frente || 'Sin Asignar'} />
                    <DetalleRow label="Detalle Ubic." valor={equipoSel.detalle_ubi} />
                    <DetalleRow label="Código / ID"   valor={equipoSel.codigo_patio} />
                    <DetalleRow label="Nº Etiqueta"   valor={equipoSel.nro_etiqueta} />
                    <DetalleRow label="Serial Motor"  valor={equipoSel.serial_motor} />
                  </AccordionSection>
                </ScrollView>
              </>
            )}
            <TouchableOpacity style={[styles.btnPrimary, { margin: 16, marginTop: 4 }]} onPress={() => setModalVisible(false)}>
              <Text style={styles.btnPrimaryText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── COMPONENTE ACORDEÓN ──────────────────────────────────────────────────────
function AccordionSection({ title, children, initialOpen = false }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12, overflow: 'hidden' }}>
      <TouchableOpacity
        onPress={() => setOpen(!open)}
        style={{ flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#f8fafc' }}
        activeOpacity={0.7}
      >
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#1e293b' }}>{title}</Text>
        <Text style={{ fontSize: 14, color: '#64748b' }}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
          {children}
        </View>
      )}
    </View>
  );
}

function DetalleRow({ label, valor }) {
  return (
    <View style={styles.detalleRow}>
      <Text style={styles.detalleLabel}>{label}:</Text>
      <Text style={styles.detalleValor}>{valor || '—'}</Text>
    </View>
  );
}


// ─── PANTALLA DE MOVILIZACIONES ───────────────────────────────────────────────
function PantallaMovilizaciones({ user, onOpenMenu }) {
  const [frentes, setFrentes] = useState([]);
  const [equiposBusq, setEquiposBusq] = useState([]);
  const [buscarEq, setBuscarEq] = useState('');
  const [equiposSel, setEquiposSel] = useState([]);
  const [frenteDest, setFrenteDest] = useState('');
  const [frenteDestNombre, setFrenteDestNombre] = useState('');
  const [detUbi, setDetUbi] = useState('');
  const [tipoMov, setTipoMov] = useState('despacho');
  const [guardando, setGuardando] = useState(false);
  const [pendientes, setPendientes] = useState([]);
  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => {
    (async () => {
      const f = await leerFrentesLocal();
      setFrentes(f);
      const p = await leerPendientes();
      setPendientes(p);
    })();
  }, []);

  const buscarEquipos = async (q) => {
    setBuscarEq(q);
    if (q.length < 2) { setEquiposBusq([]); return; }
    const data = await leerEquiposLocal(q);
    setEquiposBusq(data.slice(0, 10));
  };

  const toggleEquipo = (eq) => {
    setEquiposSel(prev =>
      prev.find(e => e.id_equipo === eq.id_equipo)
        ? prev.filter(e => e.id_equipo !== eq.id_equipo)
        : [...prev, eq]
    );
  };

  const registrarMovimiento = async () => {
    if (equiposSel.length === 0) { Alert.alert('Atención', 'Selecciona al menos un equipo.'); return; }
    if (!frenteDest) { Alert.alert('Atención', 'Selecciona el frente de destino.'); return; }
    setGuardando(true);
    try {
      if (tipoMov === 'despacho') {
        for (const eq of equiposSel) {
          await guardarMovPendiente({
            tipo: 'despacho',
            id_equipo: eq.id_equipo,
            id_frente_dest: parseInt(frenteDest),
            detalle_ubi: detUbi,
          });
          // Actualizar frente localmente
          const database = await getDb();
          await database.runAsync(
            'UPDATE equipos SET frente = ? WHERE id_equipo = ?',
            [frenteDestNombre, eq.id_equipo]
          );
        }
      } else {
        await guardarMovPendiente({
          tipo: 'recepcion_directa',
          ids_equipos: equiposSel.map(e => e.id_equipo).join(','),
          id_frente_dest: parseInt(frenteDest),
          detalle_ubi: detUbi,
        });
        const database = await getDb();
        for (const eq of equiposSel) {
          await database.runAsync(
            'UPDATE equipos SET frente = ? WHERE id_equipo = ?',
            [frenteDestNombre, eq.id_equipo]
          );
        }
      }
      const p = await leerPendientes();
      setPendientes(p);
      Alert.alert('✅ Guardado', `${equiposSel.length} movimiento(s) guardado(s) en el teléfono.\n\nPresiona "Sincronizar" cuando tengas conexión.`);
      setEquiposSel([]);
      setBuscarEq('');
      setEquiposBusq([]);
      setFrenteDest('');
      setFrenteDestNombre('');
      setDetUbi('');
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar: ' + e.message);
    } finally {
      setGuardando(false);
    }
  };

  const sincronizar = async () => {
    if (pendientes.length === 0) {
      Alert.alert('Sin pendientes', 'No hay movimientos pendientes de sincronizar.');
      return;
    }
    setSincronizando(true);
    let exitosos = 0;
    let fallidos = 0;
    try {
      for (const p of pendientes) {
        try {
          if (p.tipo_mov === 'despacho') {
            await api('POST', '/movilizaciones', {
              tipo: 'despacho',
              ID_EQUIPO: p.id_equipo,
              ID_FRENTE_DESTINO: p.id_frente_dest,
            });
          } else {
            const ids = p.ids_equipos.split(',').map(Number).filter(Boolean);
            await api('POST', '/movilizaciones', {
              tipo: 'recepcion_directa',
              ids,
              ID_FRENTE_DESTINO: p.id_frente_dest,
              DETALLE_UBICACION: p.detalle_ubi || '',
            });
          }
          await marcarSincronizado(p.id);
          exitosos++;
        } catch (_) {
          fallidos++;
        }
      }
      const nuevos = await leerPendientes();
      setPendientes(nuevos);
      Alert.alert(
        '🔄 Sincronización',
        `✅ ${exitosos} movimiento(s) enviados al servidor.\n${fallidos > 0 ? `⚠️ ${fallidos} fallaron (sin conexión).` : ''}`
      );
    } catch (e) {
      Alert.alert('Error', 'Error al sincronizar: ' + e.message);
    } finally {
      setSincronizando(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fdfbfb' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <TopHeader onOpenMenu={onOpenMenu} />

      <Text style={[styles.dashboardTitle, { marginBottom: 15 }]}>Registro de{'\n'}Movilizaciones</Text>

      <View style={{ paddingHorizontal: 20, paddingBottom: 10, flexDirection: 'row', justifyContent: 'flex-end' }}>
        {pendientes.length > 0 && (
          <TouchableOpacity
            style={[styles.btnSync, sincronizando && { opacity: 0.6 }, { backgroundColor: '#f59e0b', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 10, shadowColor: '#000', shadowOffset: {width:0,height:2}, shadowOpacity: 0.1, shadowRadius: 4 }]}
            onPress={sincronizar}
            disabled={sincronizando}
          >
            {sincronizando
              ? <ActivityIndicator color={C.white} size="small" />
              : <Text style={[styles.btnSyncText, { fontSize: 13 }]}>⬆ Sincronizar ({pendientes.length})</Text>
            }
          </TouchableOpacity>

        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* ─── Tipo de Movimiento ─── */}
        <Text style={styles.sectionTitle}>Tipo de Movimiento</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {['despacho', 'recepcion'].map(t => (
            <TouchableOpacity key={t} style={[styles.tipoBtn, tipoMov === t && styles.tipoBtnActive]} onPress={() => setTipoMov(t)}>
              <Text style={[styles.tipoBtnText, tipoMov === t && styles.tipoBtnActiveText]}>
                {t === 'despacho' ? '🚛 Despacho' : '📥 Recepción Directa'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ─── Buscar Equipos ─── */}
        <Text style={styles.label}>Buscar Equipo (código, placa, serie)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: RET-001 o ABC-123"
          placeholderTextColor={C.textSec}
          value={buscarEq}
          onChangeText={buscarEquipos}
        />

        {equiposBusq.map(eq => {
          const sel = equiposSel.find(e => e.id_equipo === eq.id_equipo);
          return (
            <TouchableOpacity key={eq.id_equipo} style={[styles.equipoBusqItem, sel && styles.equipoBusqItemSel]} onPress={() => toggleEquipo(eq)}>
              <Text style={[styles.equipoBusqText, sel && { color: C.white }]}>
                {sel ? '✓ ' : ''}{eq.codigo_patio || eq.serial_chasis} · {eq.marca} {eq.modelo}
              </Text>
              <Text style={{ fontSize: 11, color: sel ? '#bfdbfe' : C.textSec }}>{eq.frente || 'Sin Frente'}</Text>
            </TouchableOpacity>
          );
        })}

        {equiposSel.length > 0 && (
          <View style={styles.seleccionadosBox}>
            <Text style={styles.seleccionadosTitle}>✅ {equiposSel.length} equipo(s) seleccionado(s):</Text>
            {equiposSel.map(e => <Text key={e.id_equipo} style={styles.seleccionadoItem}>• {e.codigo_patio || e.serial_chasis}</Text>)}
          </View>
        )}

        {/* ─── Frente Destino ─── */}
        <Text style={styles.label}>Frente de Destino</Text>
        {frentes.length === 0 ? (
          <Text style={{ color: C.textSec, fontSize: 13, marginBottom: 12 }}>
            ⚠️ No hay frentes guardados. Descarga los datos primero.
          </Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {frentes.map(f => (
              <TouchableOpacity
                key={f.id_frente}
                style={[styles.frenteTag, frenteDest === String(f.id_frente) && styles.frenteTagActive]}
                onPress={() => { setFrenteDest(String(f.id_frente)); setFrenteDestNombre(f.nombre); }}
              >
                <Text style={[styles.frenteTagText, frenteDest === String(f.id_frente) && { color: C.white }]}>
                  {f.nombre}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {tipoMov === 'recepcion' && (
          <>
            <Text style={styles.label}>Detalle de Ubicación (opcional)</Text>
            <TextInput style={styles.input} placeholder="Ej: Área de Mantenimiento" placeholderTextColor={C.textSec} value={detUbi} onChangeText={setDetUbi} />
          </>
        )}

        <TouchableOpacity
          style={[styles.btnPrimary, { marginTop: 8 }, guardando && { opacity: 0.6 }]}
          onPress={registrarMovimiento}
          disabled={guardando}
        >
          {guardando
            ? <ActivityIndicator color={C.white} />
            : <Text style={styles.btnPrimaryText}>💾 GUARDAR EN TELÉFONO</Text>
          }
        </TouchableOpacity>

        {/* ─── Pendientes ─── */}
        {pendientes.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <Text style={styles.sectionTitle}>⏳ Pendientes de Sincronizar ({pendientes.length})</Text>
            {pendientes.map(p => (
              <View key={p.id} style={styles.pendienteItem}>
                <Text style={styles.pendienteText}>
                  {p.tipo_mov === 'despacho' ? '🚛 Despacho' : '📥 Recepción'} · {new Date(p.creado_en).toLocaleString('es-VE')}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [menuVisible, setMenuVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [equiposCount, setEquiposCount] = useState(0);

  useEffect(() => {
    (async () => {
      await getDb(); // inicializar SQLite
      const savedUser = await AsyncStorage.getItem('user');
      const token = await AsyncStorage.getItem('token');
      if (savedUser && token) setUser(JSON.parse(savedUser));
      const eqs = await leerEquiposLocal();
      setEquiposCount(eqs.length);
      setLoading(false);
    })();
  }, [activeTab]);

  const handleLogout = () => {
    Alert.alert('Cerrar Sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir', style: 'destructive',
        onPress: async () => {
          try { await api('POST', '/logout'); } catch (_) {}
          await AsyncStorage.removeItem('token');
          await AsyncStorage.removeItem('user');
          setUser(null);
          setActiveTab('dashboard');
        }
      }
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={C.blue} />
        <Text style={styles.loadingText}>Iniciando VIDALSA...</Text>
      </View>
    );
  }

  if (!user) return <PantallaLogin onLogin={setUser} />;

  return (
    <View style={{ flex: 1 }}>
      <DrawerMenu 
        visible={menuVisible} 
        onClose={() => setMenuVisible(false)} 
        onNavigate={setActiveTab} 
        onLogout={handleLogout}
        user={user}
      />
      
      <View style={{ flex: 1 }}>
        {activeTab === 'dashboard' && <PantallaDashboard onOpenMenu={() => setMenuVisible(true)} equiposCount={equiposCount} />}
        {activeTab === 'equipos'   && <PantallaEquipos user={user} onOpenMenu={() => setMenuVisible(true)} />}
        {activeTab === 'movs'      && <PantallaMovilizaciones user={user} onOpenMenu={() => setMenuVisible(true)} />}
      </View>
    </View>
  );
}

// ─── ESTILOS ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bgLight },
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  header:      { backgroundColor: C.darkBg, paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center' },
  headerTitle: { color: C.white, fontSize: 20, fontWeight: 'bold' },
  headerSub:   { color: '#94a3b8', fontSize: 12, marginTop: 2 },

  searchBar:    { paddingHorizontal: 16, paddingVertical: 10 },
  searchInput:  { backgroundColor: C.white, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 15, paddingVertical: 12, fontSize: 14, color: C.textPrim },

  // Filter pills and dropdowns
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    gap: 4,
  },
  dropdownList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  dropdownItemText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },

  // Serial text lines in equipment card (match web: "S: XXXX", "M: YYYY", "P: ZZZZ")
  serialLine: { fontSize: 13, color: '#4a5568', marginBottom: 1 },
  serialKey:  { fontWeight: '700', color: '#4a5568' },

  // Premium UI Styles
  blueCurve: {
    position: 'absolute',
    bottom: -Dimensions.get('window').height * 0.35,
    left: -Dimensions.get('window').width * 0.45,
    width: Dimensions.get('window').height,
    height: Dimensions.get('window').height,
    borderRadius: Dimensions.get('window').height / 2,
    backgroundColor: '#00004d',
  },
  blueCurveDashboard: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -Dimensions.get('window').width * 0.25,
    width: Dimensions.get('window').width * 0.65,
    backgroundColor: '#00004d',
    borderTopRightRadius: Dimensions.get('window').height * 0.4,
    borderBottomRightRadius: Dimensions.get('window').height * 0.4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginBottom: 2,
    borderRadius: 10,
    gap: 4,
  },
  menuItemText: {
    fontSize: 15,
    color: '#334155',
    fontWeight: '600',
  },
  loginCardPremium: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 30,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    marginHorizontal: 10,
  },
  inputContainerPremium: {
    borderWidth: 1,
    borderColor: '#cbd5e0',
    borderRadius: 10,
    marginBottom: 20,
    position: 'relative',
    backgroundColor: '#fff',
  },
  floatingLabel: {
    position: 'absolute',
    top: -9,
    left: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 5,
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  inputPremium: {
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1e293b',
  },
  btnPremium: {
    backgroundColor: '#00004d',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  btnPremiumText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  topHeaderPremium: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width:0, height:2},
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  dashboardTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    marginTop: 25,
    marginBottom: 20,
    lineHeight: 28,
  },
  dashboardWidgetGroup: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  widgetPremium: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width:0, height:4},
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 15,
  },
  widgetIconBox: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  badge:     { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },

  equipoCard:    { backgroundColor: C.white, borderRadius: 12, padding: 14, marginBottom: 10, elevation: 2, shadowColor: '#000', shadowOffset: {width:0,height:1}, shadowOpacity: 0.07, shadowRadius: 4 },
  equipoCodigo:  { fontSize: 15, fontWeight: 'bold', color: C.textPrim },
  equipoTipo:    { fontSize: 12, color: C.textSec, marginTop: 2 },
  equipoFrente:  { fontSize: 12, color: C.blue, marginTop: 4 },

  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContainer: { backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  modalTitle:     { fontSize: 20, fontWeight: 'bold', color: C.textPrim },
  modalSection:   { fontSize: 12, fontWeight: '700', color: C.blue, marginTop: 14, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  detalleRow:     { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.bgLight },
  detalleLabel:   { width: 110, fontSize: 13, color: C.textSec, fontWeight: '600' },
  detalleValor:   { flex: 1, fontSize: 13, color: C.textPrim },

  sectionTitle:   { fontSize: 13, fontWeight: '700', color: C.textPrim, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  tipoBtn:        { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  tipoBtnActive:  { backgroundColor: C.blue, borderColor: C.blue },
  tipoBtnText:    { fontSize: 12, color: C.textSec, fontWeight: '600' },
  tipoBtnActiveText: { color: C.white },

  equipoBusqItem:    { backgroundColor: C.bgLight, borderRadius: 8, padding: 10, marginBottom: 4, borderWidth: 1, borderColor: C.border },
  equipoBusqItemSel: { backgroundColor: C.blue, borderColor: C.blue },
  equipoBusqText:    { fontSize: 13, fontWeight: '600', color: C.textPrim },

  seleccionadosBox:   { backgroundColor: '#f0fdf4', borderRadius: 8, padding: 10, marginBottom: 12 },
  seleccionadosTitle: { fontSize: 13, fontWeight: '700', color: C.green, marginBottom: 4 },
  seleccionadoItem:   { fontSize: 12, color: C.textPrim, marginTop: 2 },

  frenteTag:       { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgLight, marginRight: 8 },
  frenteTagActive: { backgroundColor: C.blue, borderColor: C.blue },
  frenteTagText:   { fontSize: 12, fontWeight: '600', color: C.textSec },

  pendienteItem: { backgroundColor: '#fffbeb', borderRadius: 8, padding: 10, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: C.orange },
  pendienteText: { fontSize: 12, color: C.textPrim },

  tabBar:   { flexDirection: 'row', backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.border, paddingBottom: Platform.OS === 'ios' ? 20 : 8, paddingTop: 8 },
  tab:      { flex: 1, alignItems: 'center' },
  tabIcon:  { fontSize: 22 },
  tabLabel: { fontSize: 11, color: C.textSec, marginTop: 2, fontWeight: '600' },
  tabActive:{ color: C.blue },

  // PantallaLogin utilities
  loadingText: { fontSize: 14, color: C.textSec, marginTop: 12 },
  emptyText:   { fontSize: 14, color: C.textSec, textAlign: 'center' },
  btnDownload: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnDownloadText: { color: C.white, fontWeight: '700', fontSize: 14 },

  // PantallaMovilizaciones utilities
  label: { fontSize: 13, fontWeight: '700', color: C.textPrim, marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: C.textPrim, backgroundColor: C.white, marginBottom: 12,
  },
  btnPrimary: {
    backgroundColor: '#00004d', borderRadius: 10,
    paddingVertical: 15, alignItems: 'center',
  },
  btnPrimaryText: { color: C.white, fontWeight: '800', fontSize: 15 },
  btnSync: { borderRadius: 10, paddingHorizontal: 15, paddingVertical: 10, alignItems: 'center' },
  btnSyncText: { color: C.white, fontWeight: '700', fontSize: 13 },

  // Configurar IP en login
  ipBox: {
    backgroundColor: 'rgba(0,0,77,0.6)', borderRadius: 12, padding: 16,
    marginTop: 12, width: '100%',
  },
  ipInput: {
    borderWidth: 1, borderColor: '#6ee7b7', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    color: '#fff', fontSize: 14, marginBottom: 10,
  },
  btnSaveIp: {
    backgroundColor: '#10b981', borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },
  btnSaveIpText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
