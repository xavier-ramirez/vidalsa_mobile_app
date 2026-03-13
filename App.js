import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  SafeAreaView, StatusBar, FlatList, ActivityIndicator,
  Alert, ScrollView, Modal, RefreshControl, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
// IP de tu servidor Laravel (ejecutado con: php artisan serve --host=0.0.0.0)
const API_BASE = 'http://192.168.250.4:8000/api/mobile';

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
  const token = await AsyncStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Error ${res.status}`);
  return data;
}

// ─── PANTALLA DE LOGIN ────────────────────────────────────────────────────────
function PantallaLogin({ onLogin }) {
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [ultimaSync, setUltimaSync] = useState('');
  const [conteoLocal, setConteoLocal] = useState(0);

  useEffect(() => {
    (async () => {
      const fecha = await leerUltimaSincronizacion();
      if (fecha) {
        const d = new Date(fecha);
        setUltimaSync(d.toLocaleString('es-VE'));
      }
      const equipos = await leerEquiposLocal();
      setConteoLocal(equipos.length);
    })();
  }, []);

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
        `Se guardaron ${equipos.length} equipos y ${frentes.length} frentes en el teléfono.\n\nYa puedes trabajar sin internet.`
      );
    } catch (e) {
      Alert.alert(
        '❌ Sin Conexión',
        'No se pudo conectar al servidor. Verifica que estás en la misma red WiFi que la PC donde corre el sistema.\n\nDetalle: ' + e.message
      );
    } finally {
      setDescargando(false);
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
      // Descargar datos automáticamente después del login
      try {
        const [equipos, frentes] = await Promise.all([
          api('GET', '/equipos'),
          api('GET', '/frentes'),
        ]);
        await guardarEquiposLocal(equipos);
        await guardarFrentesLocal(frentes);
      } catch (_) {
        // Si falla la descarga post-login, no bloqueamos: usamos lo que hay en local
      }
      onLogin(data.user);
    } catch (e) {
      Alert.alert('Error de acceso', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.darkBg} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🚛 VIDALSA</Text>
        <Text style={styles.headerSub}>Sistema de Gestión de Flota</Text>
      </View>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}>

        {/* ── Tarjeta de Descarga Sin Login ── */}
        <View style={styles.downloadCard}>
          <Text style={styles.downloadCardTitle}>📥 Descargar Datos al Teléfono</Text>
          <Text style={styles.downloadCardSub}>
            Descarga los equipos y frentes para trabajar sin internet.{'\n'}
            Necesitas estar conectado al WiFi de la empresa.
          </Text>

          {conteoLocal > 0 && (
            <View style={styles.syncInfoBox}>
              <Text style={styles.syncInfoText}>✅ {conteoLocal} equipos guardados localmente</Text>
              {ultimaSync ? <Text style={styles.syncInfoDate}>Última descarga: {ultimaSync}</Text> : null}
            </View>
          )}

          <TouchableOpacity
            style={[styles.btnDownload, descargando && { opacity: 0.6 }]}
            onPress={descargarDatos}
            disabled={descargando}
          >
            {descargando
              ? <ActivityIndicator color={C.white} />
              : <Text style={styles.btnDownloadText}>📡 DESCARGAR DATOS AHORA</Text>
            }
          </TouchableOpacity>
        </View>

        {/* ── Tarjeta de Login ── */}
        <View style={styles.loginCard}>
          <Text style={styles.cardTitle}>Iniciar Sesión</Text>
          <Text style={styles.cardSubtitle}>Para registrar movilizaciones</Text>

          <Text style={styles.label}>Correo Electrónico</Text>
          <TextInput
            style={styles.input}
            placeholder="correo@cvidalsa27.com"
            placeholderTextColor={C.textSec}
            value={correo}
            onChangeText={setCorreo}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={C.textSec}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.btnPrimary, loading && { opacity: 0.6 }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={C.white} />
              : <Text style={styles.btnPrimaryText}>INGRESAR</Text>
            }
          </TouchableOpacity>
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

// ─── PANTALLA DE EQUIPOS ──────────────────────────────────────────────────────
function PantallaEquipos({ user, onLogout }) {
  const [equipos, setEquipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [equipoSel, setEquipoSel] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const cargar = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const data = await leerEquiposLocal(q);
      setEquipos(data);
    } catch (e) {
      Alert.alert('Error', 'No se pudo leer los datos locales.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, []);

  const onBuscar = (q) => {
    setBusqueda(q);
    cargar(q);
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.equipoCard} onPress={() => { setEquipoSel(item); setModalVisible(true); }} activeOpacity={0.7}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.equipoCodigo}>{item.codigo_patio || 'S/C'}</Text>
          <Text style={styles.equipoTipo}>{item.tipo} • {item.marca} {item.modelo}</Text>
          <Text style={styles.equipoFrente}>📍 {item.frente || 'Sin Asignar'}</Text>
        </View>
        <BadgeEstado estado={item.estado} />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.darkBg} />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>🚛 Equipos</Text>
          <Text style={styles.headerSub}>{equipos.length} unidades (datos locales)</Text>
        </View>
        <TouchableOpacity onPress={onLogout} style={styles.btnLogout}>
          <Text style={styles.btnLogoutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Código, placa, serie, frente..."
          placeholderTextColor={C.textSec}
          value={busqueda}
          onChangeText={onBuscar}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.blue} />
          <Text style={styles.loadingText}>Leyendo datos locales...</Text>
        </View>
      ) : (
        <FlatList
          data={equipos}
          keyExtractor={(item) => String(item.id_equipo)}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>
                {busqueda
                  ? 'Sin resultados. Intenta con otro término.'
                  : '⚠️ No hay datos locales.\nVuelve al login y presiona "Descargar Datos".'}
              </Text>
            </View>
          }
          contentContainerStyle={{ padding: 12 }}
        />
      )}

      {/* Modal Detalle Equipo */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <ScrollView>
              {equipoSel && (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Text style={styles.modalTitle}>{equipoSel.codigo_patio || 'Sin Código'}</Text>
                    <BadgeEstado estado={equipoSel.estado} />
                  </View>
                  <Text style={styles.modalSection}>📋 Datos del Vehículo</Text>
                  <DetalleRow label="Tipo"     valor={equipoSel.tipo} />
                  <DetalleRow label="Marca"    valor={equipoSel.marca} />
                  <DetalleRow label="Modelo"   valor={equipoSel.modelo} />
                  <DetalleRow label="Año"      valor={equipoSel.anio} />
                  <DetalleRow label="Categoría" valor={equipoSel.categoria} />
                  <Text style={styles.modalSection}>🔩 Identificación</Text>
                  <DetalleRow label="S. Chasis"  valor={equipoSel.serial_chasis} />
                  <DetalleRow label="S. Motor"   valor={equipoSel.serial_motor} />
                  <DetalleRow label="Placa"      valor={equipoSel.placa} />
                  <DetalleRow label="Nº Etiqueta" valor={equipoSel.nro_etiqueta} />
                  <Text style={styles.modalSection}>📍 Ubicación Actual</Text>
                  <DetalleRow label="Frente"  valor={equipoSel.frente} />
                  <DetalleRow label="Detalle" valor={equipoSel.detalle_ubi} />
                </>
              )}
            </ScrollView>
            <TouchableOpacity style={[styles.btnPrimary, { margin: 16 }]} onPress={() => setModalVisible(false)}>
              <Text style={styles.btnPrimaryText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
function PantallaMovilizaciones({ user }) {
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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.darkBg} />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>🔄 Movilizaciones</Text>
          <Text style={styles.headerSub}>Datos guardados en el teléfono</Text>
        </View>
        {pendientes.length > 0 && (
          <TouchableOpacity
            style={[styles.btnSync, sincronizando && { opacity: 0.6 }]}
            onPress={sincronizar}
            disabled={sincronizando}
          >
            {sincronizando
              ? <ActivityIndicator color={C.white} size="small" />
              : <Text style={styles.btnSyncText}>⬆ Sincronizar ({pendientes.length})</Text>
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
  const [activeTab, setActiveTab] = useState('equipos');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await getDb(); // inicializar SQLite
      const savedUser = await AsyncStorage.getItem('user');
      const token = await AsyncStorage.getItem('token');
      if (savedUser && token) setUser(JSON.parse(savedUser));
      setLoading(false);
    })();
  }, []);

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
          setActiveTab('equipos');
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
      <View style={{ flex: 1 }}>
        {activeTab === 'equipos' && <PantallaEquipos user={user} onLogout={handleLogout} />}
        {activeTab === 'movs'   && <PantallaMovilizaciones user={user} />}
      </View>
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tab} onPress={() => setActiveTab('equipos')}>
          <Text style={[styles.tabIcon, activeTab === 'equipos' && styles.tabActive]}>🚛</Text>
          <Text style={[styles.tabLabel, activeTab === 'equipos' && styles.tabActive]}>Equipos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => setActiveTab('movs')}>
          <Text style={[styles.tabIcon, activeTab === 'movs' && styles.tabActive]}>🔄</Text>
          <Text style={[styles.tabLabel, activeTab === 'movs' && styles.tabActive]}>Movilizaciones</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={handleLogout}>
          <Text style={styles.tabIcon}>🚪</Text>
          <Text style={styles.tabLabel}>Salir</Text>
        </TouchableOpacity>
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

  // Login
  downloadCard:     { backgroundColor: C.navyBg, borderRadius: 14, padding: 18, marginBottom: 16 },
  downloadCardTitle:{ color: C.white, fontSize: 16, fontWeight: 'bold', marginBottom: 6 },
  downloadCardSub:  { color: '#94a3b8', fontSize: 13, lineHeight: 20, marginBottom: 14 },
  syncInfoBox:      { backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 8, padding: 10, marginBottom: 12 },
  syncInfoText:     { color: C.green, fontWeight: 'bold', fontSize: 13 },
  syncInfoDate:     { color: '#6ee7b7', fontSize: 12, marginTop: 2 },
  btnDownload:      { backgroundColor: C.green, padding: 14, borderRadius: 10, alignItems: 'center' },
  btnDownloadText:  { color: C.white, fontWeight: 'bold', fontSize: 14 },
  loginCard:        { backgroundColor: C.white, borderRadius: 16, padding: 22, elevation: 4, shadowColor: '#000', shadowOffset: {width:0,height:2}, shadowOpacity: 0.1, shadowRadius: 8 },
  cardTitle:        { fontSize: 24, fontWeight: 'bold', color: C.textPrim, marginBottom: 4 },
  cardSubtitle:     { fontSize: 13, color: C.textSec, marginBottom: 20 },

  label:           { fontSize: 13, fontWeight: '600', color: C.textPrim, marginBottom: 6 },
  input:           { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 13, fontSize: 14, color: C.textPrim, backgroundColor: C.bgLight, marginBottom: 14 },
  btnPrimary:      { backgroundColor: C.blue, padding: 15, borderRadius: 10, alignItems: 'center' },
  btnPrimaryText:  { color: C.white, fontSize: 15, fontWeight: 'bold' },
  btnLogout:       { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  btnLogoutText:   { color: C.white, fontSize: 13, fontWeight: '600' },
  btnSync:         { backgroundColor: C.orange, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  btnSyncText:     { color: C.white, fontSize: 12, fontWeight: 'bold' },

  loadingText:  { color: C.textSec, marginTop: 12, fontSize: 14 },
  emptyText:    { color: C.textSec, textAlign: 'center', fontSize: 14, lineHeight: 22 },

  searchBar:    { backgroundColor: C.white, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  searchInput:  { backgroundColor: C.bgLight, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.textPrim },

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
});
