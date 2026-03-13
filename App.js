import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  SafeAreaView, StatusBar, FlatList, ActivityIndicator,
  Alert, ScrollView, Modal, RefreshControl, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
// IMPORTANTE: Cambia esta IP por la IP local de tu PC donde corre Laravel.
// Para encontrarla: abre "cmd" en tu PC y escribe "ipconfig", busca "Dirección IPv4"
const API_BASE = 'http://192.168.250.4:8000/api/mobile'; // <-- CAMBIA ESTA IP


// ─── COLORES VIDALSA ─────────────────────────────────────────────────────────
const C = {
  darkBg:   '#0f172a',
  navyBg:   '#1e293b',
  blue:     '#2563eb',
  blueDark: '#1d4ed8',
  green:    '#10b981',
  orange:   '#f59e0b',
  red:      '#ef4444',
  textPrim: '#1e293b',
  textSec:  '#64748b',
  border:   '#e2e8f0',
  bgLight:  '#f8fafc',
  white:    '#ffffff',
  badge_op: '#dcfce7',
  badge_op_text: '#166534',
  badge_man: '#fef9c3',
  badge_man_text: '#854d0e',
  badge_in:  '#fee2e2',
  badge_in_text: '#991b1b',
};

// ─── API HELPER ───────────────────────────────────────────────────────────────
async function api(method, path, body = null) {
  const token = await AsyncStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || 'Error de servidor');
  return data;
}

// ─── PANTALLA DE LOGIN ────────────────────────────────────────────────────────
function PantallaLogin({ onLogin }) {
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!correo || !password) {
      Alert.alert('Campos vacíos', 'Por favor ingresa tu correo y contraseña.');
      return;
    }
    setLoading(true);
    try {
      const data = await api('POST', '/login', { correo, password });
      await AsyncStorage.setItem('token', data.token);
      await AsyncStorage.setItem('user', JSON.stringify(data.user));
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
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <View style={styles.loginCard}>
          <Text style={styles.cardTitle}>Iniciar Sesión</Text>
          <Text style={styles.cardSubtitle}>Módulo de Trabajo de Campo</Text>

          <Text style={styles.label}>Correo Electrónico</Text>
          <TextInput
            style={styles.input}
            placeholder="ejemplo@cvidalsa27.com"
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

          <TouchableOpacity style={[styles.btnPrimary, loading && { opacity: 0.6 }]} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color={C.white} /> : <Text style={styles.btnPrimaryText}>INGRESAR AL SISTEMA</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── BADGE DE ESTADO ─────────────────────────────────────────────────────────
function BadgeEstado({ estado }) {
  const map = {
    'OPERATIVO':        { bg: C.badge_op,  color: C.badge_op_text },
    'INOPERATIVO':      { bg: C.badge_in,  color: C.badge_in_text },
    'EN MANTENIMIENTO': { bg: C.badge_man, color: C.badge_man_text },
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
  const [refreshing, setRefreshing] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [equipoSeleccionado, setEquipoSeleccionado] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const cargarEquipos = useCallback(async () => {
    try {
      const data = await api('GET', '/equipos');
      setEquipos(data);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { cargarEquipos(); }, []);

  const equiposFiltrados = equipos.filter(eq => {
    const q = busqueda.toUpperCase();
    return !q ||
      (eq.CODIGO_PATIO || '').includes(q) ||
      (eq.MARCA || '').includes(q) ||
      (eq.MODELO || '').includes(q) ||
      (eq.SERIAL_CHASIS || '').includes(q) ||
      (eq.FRENTE_ACTUAL || '').includes(q) ||
      (eq.PLACA || '').includes(q);
  });

  const abrirDetalle = (equipo) => {
    setEquipoSeleccionado(equipo);
    setModalVisible(true);
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.equipoCard} onPress={() => abrirDetalle(item)} activeOpacity={0.7}>
      <View style={styles.equipoCardRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.equipoCodigo}>{item.CODIGO_PATIO || 'S/C'}</Text>
          <Text style={styles.equipoTipo}>{item.TIPO} • {item.MARCA} {item.MODELO}</Text>
          <Text style={styles.equipoFrente}>📍 {item.FRENTE_ACTUAL || 'Sin Asignar'}</Text>
        </View>
        <BadgeEstado estado={item.ESTADO_OPERATIVO} />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.darkBg} />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>🚛 Equipos</Text>
          <Text style={styles.headerSub}>{equipos.length} unidades cargadas</Text>
        </View>
        <TouchableOpacity onPress={onLogout} style={styles.btnLogout}>
          <Text style={styles.btnLogoutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Buscar por código, placa, serie, frente..."
          placeholderTextColor={C.textSec}
          value={busqueda}
          onChangeText={setBusqueda}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.blue} />
          <Text style={styles.loadingText}>Cargando equipos desde el servidor...</Text>
        </View>
      ) : (
        <FlatList
          data={equiposFiltrados}
          keyExtractor={(item) => String(item.ID_EQUIPO)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargarEquipos(); }} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>
                {busqueda ? 'No se encontraron resultados para tu búsqueda.' : 'No hay equipos registrados.'}
              </Text>
            </View>
          }
          contentContainerStyle={{ padding: 12 }}
        />
      )}

      {/* Modal de Detalle de Equipo */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <ScrollView>
              {equipoSeleccionado && (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>{equipoSeleccionado.CODIGO_PATIO || 'Sin Código'}</Text>
                    <BadgeEstado estado={equipoSeleccionado.ESTADO_OPERATIVO} />
                  </View>

                  <Text style={styles.modalSection}>📋 Datos del Vehículo</Text>
                  <DetalleRow label="Tipo" valor={equipoSeleccionado.TIPO} />
                  <DetalleRow label="Marca" valor={equipoSeleccionado.MARCA} />
                  <DetalleRow label="Modelo" valor={equipoSeleccionado.MODELO} />
                  <DetalleRow label="Año" valor={equipoSeleccionado.ANIO} />
                  <DetalleRow label="Categoría" valor={equipoSeleccionado.CATEGORIA_FLOTA} />

                  <Text style={styles.modalSection}>🔩 Identificación</Text>
                  <DetalleRow label="Serial Chasis" valor={equipoSeleccionado.SERIAL_CHASIS} />
                  <DetalleRow label="Serial Motor" valor={equipoSeleccionado.SERIAL_MOTOR} />
                  <DetalleRow label="Placa" valor={equipoSeleccionado.PLACA} />
                  <DetalleRow label="Nº Etiqueta" valor={equipoSeleccionado.NUMERO_ETIQUETA} />

                  <Text style={styles.modalSection}>📍 Ubicación Actual</Text>
                  <DetalleRow label="Frente" valor={equipoSeleccionado.FRENTE_ACTUAL} />
                  <DetalleRow label="Detalle" valor={equipoSeleccionado.DETALLE_UBICACION} />
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
  const [movs, setMovs] = useState([]);
  const [frentes, setFrentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal Nueva Movilización
  const [modalNuevo, setModalNuevo] = useState(false);
  const [equiposBusqueda, setEquiposBusqueda] = useState([]);
  const [buscarEq, setBuscarEq] = useState('');
  const [buscandoEq, setBuscandoEq] = useState(false);
  const [equiposSel, setEquiposSel] = useState([]);
  const [frenteDest, setFrenteDest] = useState('');
  const [detUbicacion, setDetUbicacion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [tipoMov, setTipoMov] = useState('despacho'); // 'despacho' | 'recepcion'

  const cargar = useCallback(async () => {
    try {
      const [mData, fData] = await Promise.all([
        api('GET', '/movilizaciones'),
        api('GET', '/frentes'),
      ]);
      setMovs(mData.data || mData);
      setFrentes(fData);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { cargar(); }, []);

  const buscarEquipos = async (q) => {
    setBuscarEq(q);
    if (q.length < 2) { setEquiposBusqueda([]); return; }
    setBuscandoEq(true);
    try {
      const data = await api('GET', `/equipos?search=${q}`);
      setEquiposBusqueda(data.slice(0, 10));
    } catch (e) {
      setEquiposBusqueda([]);
    } finally {
      setBuscandoEq(false);
    }
  };

  const toggleEquipo = (eq) => {
    setEquiposSel(prev =>
      prev.find(e => e.ID_EQUIPO === eq.ID_EQUIPO)
        ? prev.filter(e => e.ID_EQUIPO !== eq.ID_EQUIPO)
        : [...prev, eq]
    );
  };

  const guardarMovilizacion = async () => {
    if (equiposSel.length === 0) { Alert.alert('Atención', 'Selecciona al menos un equipo.'); return; }
    if (!frenteDest) { Alert.alert('Atención', 'Selecciona el frente de destino.'); return; }
    setGuardando(true);
    try {
      if (tipoMov === 'recepcion') {
        await api('POST', '/movilizaciones', {
          tipo: 'recepcion_directa',
          ids: equiposSel.map(e => e.ID_EQUIPO),
          ID_FRENTE_DESTINO: frenteDest,
          DETALLE_UBICACION: detUbicacion,
        });
      } else {
        for (const eq of equiposSel) {
          await api('POST', '/movilizaciones', {
            tipo: 'despacho',
            ID_EQUIPO: eq.ID_EQUIPO,
            ID_FRENTE_DESTINO: frenteDest,
          });
        }
      }
      Alert.alert('✅ Éxito', `${equiposSel.length} equipo(s) movilizados correctamente.`);
      setModalNuevo(false);
      setEquiposSel([]);
      setBuscarEq('');
      setEquiposBusqueda([]);
      setFrenteDest('');
      setDetUbicacion('');
      cargar();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setGuardando(false);
    }
  };

  const badgeMov = (estado) => {
    const map = {
      'TRANSITO': { bg: '#fef9c3', color: '#854d0e', icon: '🚛' },
      'RECIBIDO': { bg: '#dcfce7', color: '#166534', icon: '✅' },
      'RECHAZADO': { bg: '#fee2e2', color: '#991b1b', icon: '❌' },
    };
    return map[estado] || { bg: '#e2e8f0', color: '#475569', icon: '📦' };
  };

  const renderMov = ({ item }) => {
    const bs = badgeMov(item.ESTADO_MVO);
    return (
      <View style={styles.movCard}>
        <View style={styles.movCardHeader}>
          <Text style={styles.movCodigo}>{bs.icon} {item.CODIGO_CONTROL ? `MV-${item.CODIGO_CONTROL}` : item.TIPO_MOVIMIENTO}</Text>
          <View style={[styles.badge, { backgroundColor: bs.bg }]}>
            <Text style={[styles.badgeText, { color: bs.color }]}>{item.ESTADO_MVO}</Text>
          </View>
        </View>
        <Text style={styles.movEquipo}>{item.equipo?.CODIGO_PATIO || '—'} · {item.equipo?.MARCA} {item.equipo?.MODELO}</Text>
        <View style={styles.movRuta}>
          <Text style={styles.movFrente}>{item.frente_origen?.NOMBRE_FRENTE || 'Origen'}</Text>
          <Text style={{ color: C.blue, fontWeight: 'bold' }}>  ➜  </Text>
          <Text style={styles.movFrente}>{item.frente_destino?.NOMBRE_FRENTE || 'Destino'}</Text>
        </View>
        <Text style={styles.movFecha}>{item.FECHA_DESPACHO || item.FECHA_RECEPCION || ''}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.darkBg} />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>🔄 Movilizaciones</Text>
          <Text style={styles.headerSub}>Registro de movimientos de flota</Text>
        </View>
        <TouchableOpacity style={styles.btnAdd} onPress={() => setModalNuevo(true)}>
          <Text style={styles.btnAddText}>+ Nueva</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.blue} />
          <Text style={styles.loadingText}>Cargando movimientos...</Text>
        </View>
      ) : (
        <FlatList
          data={movs}
          keyExtractor={(item) => String(item.ID_MOVILIZACION)}
          renderItem={renderMov}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(); }} />}
          ListEmptyComponent={<View style={styles.centered}><Text style={styles.emptyText}>No hay movilizaciones registradas.</Text></View>}
          contentContainerStyle={{ padding: 12 }}
        />
      )}

      {/* Modal Nueva Movilización */}
      <Modal visible={modalNuevo} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Nueva Movilización</Text>

            {/* Tipo de movimiento */}
            <View style={{ flexDirection: 'row', marginBottom: 12, gap: 8 }}>
              {['despacho','recepcion'].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.tipoBtn, tipoMov === t && styles.tipoBtnActive]}
                  onPress={() => setTipoMov(t)}
                >
                  <Text style={[styles.tipoBtnText, tipoMov === t && styles.tipoBtnActiveText]}>
                    {t === 'despacho' ? '🚛 Despacho' : '📥 Recepción Directa'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Buscar Equipo (código, placa, serie)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: RET-001 o ABC-123"
              placeholderTextColor={C.textSec}
              value={buscarEq}
              onChangeText={buscarEquipos}
            />
            {buscandoEq && <ActivityIndicator size="small" color={C.blue} style={{ marginVertical: 4 }} />}

            {equiposBusqueda.map(eq => {
              const sel = equiposSel.find(e => e.ID_EQUIPO === eq.ID_EQUIPO);
              return (
                <TouchableOpacity
                  key={eq.ID_EQUIPO}
                  style={[styles.equipoBusqItem, sel && styles.equipoBusqItemSel]}
                  onPress={() => toggleEquipo(eq)}
                >
                  <Text style={[styles.equipoBusqText, sel && { color: C.white }]}>
                    {sel ? '✓ ' : ''}{eq.CODIGO_PATIO || eq.SERIAL_CHASIS} · {eq.MARCA} {eq.MODELO}
                  </Text>
                  <Text style={[{ fontSize: 11, color: sel ? '#bfdbfe' : C.textSec }]}>
                    {eq.FRENTE_ACTUAL || 'Sin frente'}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {equiposSel.length > 0 && (
              <View style={styles.seleccionadosBox}>
                <Text style={styles.seleccionadosTitle}>✅ {equiposSel.length} equipo(s) seleccionado(s):</Text>
                {equiposSel.map(e => (
                  <Text key={e.ID_EQUIPO} style={styles.seleccionadoItem}>• {e.CODIGO_PATIO || e.SERIAL_CHASIS}</Text>
                ))}
              </View>
            )}

            <Text style={styles.label}>Frente de Destino</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {frentes.map(f => (
                <TouchableOpacity
                  key={f.ID_FRENTE}
                  style={[styles.frenteTag, frenteDest === String(f.ID_FRENTE) && styles.frenteTagActive]}
                  onPress={() => setFrenteDest(String(f.ID_FRENTE))}
                >
                  <Text style={[styles.frenteTagText, frenteDest === String(f.ID_FRENTE) && { color: C.white }]}>
                    {f.NOMBRE_FRENTE}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {tipoMov === 'recepcion' && (
              <>
                <Text style={styles.label}>Detalle de Ubicación (opcional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: Área de Mantenimiento"
                  placeholderTextColor={C.textSec}
                  value={detUbicacion}
                  onChangeText={setDetUbicacion}
                />
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={() => setModalNuevo(false)}>
                <Text style={styles.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }, guardando && { opacity: 0.6 }]} onPress={guardarMovilizacion} disabled={guardando}>
                {guardando ? <ActivityIndicator color={C.white} /> : <Text style={styles.btnPrimaryText}>Registrar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── APP PRINCIPAL CON TABS ───────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('equipos');
  const [loading, setLoading] = useState(true);

  // Verificar sesión guardada
  useEffect(() => {
    (async () => {
      const savedUser = await AsyncStorage.getItem('user');
      const token = await AsyncStorage.getItem('token');
      if (savedUser && token) setUser(JSON.parse(savedUser));
      setLoading(false);
    })();
  }, []);

  const handleLogout = async () => {
    Alert.alert('Cerrar Sesión', '¿Estás seguro de que deseas salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
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

  if (!user) {
    return <PantallaLogin onLogin={setUser} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {activeTab === 'equipos' && <PantallaEquipos user={user} onLogout={handleLogout} />}
        {activeTab === 'movs' && <PantallaMovilizaciones user={user} />}
      </View>

      {/* Tab Bar inferior */}
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
  container: { flex: 1, backgroundColor: C.bgLight },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  header: { backgroundColor: C.darkBg, paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center' },
  headerTitle: { color: C.white, fontSize: 20, fontWeight: 'bold' },
  headerSub: { color: '#94a3b8', fontSize: 12, marginTop: 2 },

  loginCard: { margin: 20, backgroundColor: C.white, borderRadius: 16, padding: 24, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  cardTitle: { fontSize: 26, fontWeight: 'bold', color: C.textPrim, marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: C.textSec, marginBottom: 24 },

  label: { fontSize: 13, fontWeight: '600', color: C.textPrim, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 13, fontSize: 15, color: C.textPrim, backgroundColor: C.bgLight, marginBottom: 16 },

  btnPrimary: { backgroundColor: C.blue, padding: 15, borderRadius: 10, alignItems: 'center' },
  btnPrimaryText: { color: C.white, fontSize: 15, fontWeight: 'bold' },
  btnSecondary: { backgroundColor: '#f1f5f9', padding: 15, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  btnSecondaryText: { color: C.textPrim, fontSize: 15, fontWeight: '600' },

  btnLogout: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnLogoutText: { color: C.white, fontSize: 13, fontWeight: '600' },
  btnAdd: { backgroundColor: C.blue, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnAddText: { color: C.white, fontSize: 13, fontWeight: 'bold' },

  loadingText: { color: C.textSec, marginTop: 12, fontSize: 14 },
  emptyText: { color: C.textSec, textAlign: 'center', fontSize: 14, lineHeight: 22 },

  searchBar: { backgroundColor: C.white, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  searchInput: { backgroundColor: C.bgLight, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.textPrim },

  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: 'bold' },

  equipoCard: { backgroundColor: C.white, borderRadius: 12, padding: 14, marginBottom: 10, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4 },
  equipoCardRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  equipoCodigo: { fontSize: 16, fontWeight: 'bold', color: C.textPrim },
  equipoTipo: { fontSize: 13, color: C.textSec, marginTop: 2 },
  equipoFrente: { fontSize: 12, color: C.blue, marginTop: 4 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContainer: { backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: C.textPrim, marginBottom: 12 },
  modalSection: { fontSize: 13, fontWeight: '700', color: C.blue, marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },

  detalleRow: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.bgLight },
  detalleLabel: { width: 120, fontSize: 13, color: C.textSec, fontWeight: '600' },
  detalleValor: { flex: 1, fontSize: 13, color: C.textPrim },

  movCard: { backgroundColor: C.white, borderRadius: 12, padding: 14, marginBottom: 10, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4 },
  movCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  movCodigo: { fontSize: 14, fontWeight: 'bold', color: C.textPrim },
  movEquipo: { fontSize: 13, color: C.textSec, marginBottom: 4 },
  movRuta: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  movFrente: { fontSize: 12, color: C.textPrim, fontWeight: '600' },
  movFecha: { fontSize: 11, color: C.textSec },

  tipoBtn: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  tipoBtnActive: { backgroundColor: C.blue, borderColor: C.blue },
  tipoBtnText: { fontSize: 13, color: C.textSec, fontWeight: '600' },
  tipoBtnActiveText: { color: C.white },

  equipoBusqItem: { backgroundColor: C.bgLight, borderRadius: 8, padding: 10, marginBottom: 4, borderWidth: 1, borderColor: C.border },
  equipoBusqItemSel: { backgroundColor: C.blue, borderColor: C.blue },
  equipoBusqText: { fontSize: 13, fontWeight: '600', color: C.textPrim },

  seleccionadosBox: { backgroundColor: '#f0fdf4', borderRadius: 8, padding: 10, marginBottom: 12 },
  seleccionadosTitle: { fontSize: 13, fontWeight: '700', color: C.green, marginBottom: 4 },
  seleccionadoItem: { fontSize: 12, color: C.textPrim, marginTop: 2 },

  frenteTag: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgLight, marginRight: 8 },
  frenteTagActive: { backgroundColor: C.blue, borderColor: C.blue },
  frenteTagText: { fontSize: 12, fontWeight: '600', color: C.textSec },

  tabBar: { flexDirection: 'row', backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.border, paddingBottom: Platform.OS === 'ios' ? 20 : 8, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center' },
  tabIcon: { fontSize: 22 },
  tabLabel: { fontSize: 11, color: C.textSec, marginTop: 2, fontWeight: '600' },
  tabActive: { color: C.blue },
});
