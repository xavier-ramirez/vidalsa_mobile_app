import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  FlatList,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  RefreshControl,
  Platform,
  Image,
  Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SQLite from "expo-sqlite";
import { MaterialIcons } from "@expo/vector-icons";
import * as Linking from "expo-linking";

// ─── SISTEMA DE ALERTAS MODERNAS ───
const AlertEmitter = {
  listener: null,
  emit: (title, message, buttonsOrType, maybeButtons) => {
    let type = "info";
    let buttons = null;

    if (Array.isArray(buttonsOrType)) {
      buttons = buttonsOrType;
    } else if (typeof buttonsOrType === "string") {
      type = buttonsOrType;
      buttons = maybeButtons;
    }

    if (AlertEmitter.listener) {
      AlertEmitter.listener({ title, message, type, buttons, visible: true });
    } else {
      Alert.alert(title, message, buttons);
    }
  },
};

export const showModernAlert = (
  title,
  message,
  buttonsOrType,
  maybeButtons,
) => {
  AlertEmitter.emit(title, message, buttonsOrType, maybeButtons);
};

function ModernAlertModal() {
  const [data, setData] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info",
    buttons: null,
  });

  useEffect(() => {
    AlertEmitter.listener = (d) => setData(d);
    return () => {
      AlertEmitter.listener = null;
    };
  }, []);

  if (!data.visible) return null;

  const close = () => setData((prev) => ({ ...prev, visible: false }));

  const isSuccess =
    data.type === "success" ||
    (data.title &&
      (data.title.includes("✅") ||
        data.title.toLowerCase().includes("guardado") ||
        data.title.toLowerCase().includes("exitosa") ||
        data.title.toLowerCase().includes("asignados")));
  const isError =
    data.type === "error" ||
    (data.title &&
      (data.title.includes("❌") ||
        data.title.toLowerCase().includes("error")));
  const isWarning =
    data.type === "warning" ||
    (data.title &&
      (data.title.toLowerCase().includes("atención") ||
        data.title.toLowerCase().includes("cerrar sesión")));

  const iconName = isSuccess
    ? "check-circle"
    : isError
      ? "error"
      : isWarning
        ? "warning"
        : "info";
  const iconColor = isSuccess
    ? "#10b981"
    : isError
      ? "#ef4444"
      : isWarning
        ? "#f59e0b"
        : "#3b82f6";
  const bgColor = isSuccess
    ? "#ecfdf5"
    : isError
      ? "#fef2f2"
      : isWarning
        ? "#fffbeb"
        : "#eff6ff";

  // Default button if no buttons array given
  const renderButtons = () => {
    if (!data.buttons || data.buttons.length === 0) {
      return (
        <TouchableOpacity
          onPress={close}
          style={{
            backgroundColor: iconColor,
            width: "100%",
            paddingVertical: 14,
            borderRadius: 10,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>
            OK
          </Text>
        </TouchableOpacity>
      );
    }
    return (
      <View style={{ flexDirection: "row", gap: 10, width: "100%" }}>
        {data.buttons.map((btn, i) => {
          const isCancel =
            btn.style === "cancel" || btn.text.toLowerCase() === "cancelar";
          const isDestructive =
            btn.style === "destructive" || btn.text.toLowerCase() === "salir";

          const btnBgColor = isCancel
            ? "#f1f5f9"
            : isDestructive
              ? "#ef4444"
              : iconColor;
          const btnTextColor = isCancel ? "#475569" : "#ffffff";
          const btnBorder = isCancel
            ? { borderWidth: 1, borderColor: "#cbd5e1" }
            : {};

          return (
            <TouchableOpacity
              key={i}
              style={[
                btnBorder,
                {
                  flex: 1,
                  backgroundColor: btnBgColor,
                  paddingVertical: 14,
                  borderRadius: 10,
                  alignItems: "center",
                },
              ]}
              onPress={() => {
                close();
                if (btn.onPress) setTimeout(btn.onPress, 300); // give time to closing animation
              }}
            >
              <Text
                style={{ color: btnTextColor, fontSize: 14, fontWeight: "800" }}
              >
                {btn.text}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <Modal
      visible={data.visible}
      transparent={true}
      animationType="fade"
      onRequestClose={close}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(15,23,42,0.65)",
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 360,
            backgroundColor: "#ffffff",
            borderRadius: 20,
            overflow: "hidden",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.25,
            shadowRadius: 20,
            elevation: 15,
          }}
        >
          <View
            style={{ alignItems: "center", padding: 28, paddingBottom: 15 }}
          >
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: bgColor,
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <MaterialIcons name={iconName} size={40} color={iconColor} />
            </View>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "900",
                color: "#1e293b",
                marginBottom: 12,
                textAlign: "center",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {data.title}
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: "#64748b",
                textAlign: "center",
                lineHeight: 22,
              }}
            >
              {data.message}
            </Text>
          </View>

          <View style={{ padding: 24, paddingTop: 10 }}>{renderButtons()}</View>
        </View>
      </View>
    </Modal>
  );
}

// ─── FIN ALERTA MODERNA ───

// Logo local (no depende del servidor)
const LOGO_LOCAL = require("./assets/logo.webp");

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
// URL de producción por defecto. Si el usuario configura una IP local, se usará http://.
// Si el valor guardado contiene un dominio (punto, no IP), se usa https://.
const DEFAULT_SERVER = "vidalsa-web.mnsxjk.easypanel.host";

async function getApiBase() {
  const saved = await AsyncStorage.getItem("server_ip");
  let host = saved && saved.trim() ? saved.trim() : DEFAULT_SERVER;

  // Quitar protocolo existente (lo determinamos nosotros)
  host = host.replace(/^https?:\/\//i, "");
  // Quitar barras al final
  host = host.replace(/\/+$/, "");

  // Usar HTTPS si es un dominio (tiene letras, no solo numeros y puntos)
  const isLocalIp = /^[\d\.]+(:\d+)?$/.test(host) || /^localhost(:\d+)?$/.test(host);
  const protocol = isLocalIp ? "http" : "https";

  return `${protocol}://${host}/api/mobile`;
}

// ─── COLORES ──────────────────────────────────────────────────────────────────
const C = {
  darkBg: "#0f172a",
  navyBg: "#1e293b",
  blue: "#2563eb",
  green: "#10b981",
  orange: "#f59e0b",
  red: "#ef4444",
  textPrim: "#1e293b",
  textSec: "#64748b",
  border: "#e2e8f0",
  bgLight: "#f8fafc",
  white: "#ffffff",
};

// ─── BASE DE DATOS SQLITE ─────────────────────────────────────────────────────
let db = null;

async function getDb() {
  if (!db) {
    db = await SQLite.openDatabaseAsync("vidalsa.db");
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
  await database.runAsync("DELETE FROM equipos");
  for (const eq of equipos) {
    await database.runAsync(
      `INSERT INTO equipos VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        eq.ID_EQUIPO,
        eq.CODIGO_PATIO || "",
        eq.TIPO || "",
        eq.MARCA || "",
        eq.MODELO || "",
        eq.ANIO || "",
        eq.CATEGORIA_FLOTA || "",
        eq.SERIAL_CHASIS || "",
        eq.SERIAL_MOTOR || "",
        eq.NUMERO_ETIQUETA || "",
        eq.ESTADO_OPERATIVO || "",
        eq.PLACA || "",
        eq.FRENTE_ACTUAL || "",
        eq.DETALLE_UBICACION || "",
        eq.CONFIRMADO || 0,
      ],
    );
  }
  await database.runAsync(
    `INSERT OR REPLACE INTO meta VALUES ('ultima_sincronizacion', ?)`,
    [new Date().toISOString()],
  );
}

// Guardar frentes en SQLite
async function guardarFrentesLocal(frentes) {
  const database = await getDb();
  await database.runAsync("DELETE FROM frentes");
  for (const f of frentes) {
    await database.runAsync(`INSERT INTO frentes VALUES (?,?,?,?)`, [
      f.ID_FRENTE,
      f.NOMBRE_FRENTE || "",
      f.TIPO_FRENTE || "",
      f.UBICACION || "",
    ]);
  }
}

// Leer equipos desde SQLite
async function leerEquiposLocal(busqueda = "") {
  const database = await getDb();
  const q = `%${busqueda.toUpperCase()}%`;
  if (!busqueda) {
    return await database.getAllAsync(
      "SELECT * FROM equipos ORDER BY codigo_patio ASC",
    );
  }
  return await database.getAllAsync(
    `SELECT * FROM equipos WHERE
      UPPER(codigo_patio) LIKE ? OR UPPER(marca) LIKE ? OR UPPER(modelo) LIKE ?
      OR UPPER(serial_chasis) LIKE ? OR UPPER(frente) LIKE ? OR UPPER(placa) LIKE ?
     ORDER BY codigo_patio ASC`,
    [q, q, q, q, q, q],
  );
}

// Leer frentes desde SQLite
async function leerFrentesLocal() {
  const database = await getDb();
  return await database.getAllAsync(
    "SELECT * FROM frentes ORDER BY nombre ASC",
  );
}

// Guardar movilización pendiente (offline)
async function guardarMovPendiente(datos) {
  const database = await getDb();
  await database.runAsync(
    `INSERT INTO movilizaciones_pendientes
      (tipo_mov, id_equipo, id_frente_dest, detalle_ubi, ids_equipos, creado_en)
     VALUES (?,?,?,?,?,?)`,
    [
      datos.tipo || "despacho",
      datos.id_equipo || null,
      datos.id_frente_dest || null,
      datos.detalle_ubi || "",
      datos.ids_equipos || "",
      new Date().toISOString(),
    ],
  );
}

// Leer pendientes sin sincronizar
async function leerPendientes() {
  const database = await getDb();
  return await database.getAllAsync(
    "SELECT * FROM movilizaciones_pendientes WHERE sincronizado = 0",
  );
}

// Marcar pendiente como sincronizado
async function marcarSincronizado(id) {
  const database = await getDb();
  await database.runAsync(
    "UPDATE movilizaciones_pendientes SET sincronizado = 1 WHERE id = ?",
    [id],
  );
}

// Leer fecha de última sincronización
async function leerUltimaSincronizacion() {
  const database = await getDb();
  const r = await database.getFirstAsync(
    "SELECT valor FROM meta WHERE clave = 'ultima_sincronizacion'",
  );
  return r ? r.valor : null;
}

// ─── API HELPER ───────────────────────────────────────────────────────────────
async function api(method, path, body = null) {
  const apiBase = await getApiBase();
  const token = await AsyncStorage.getItem("token");
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${apiBase}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(data.error || data.message || `Error ${res.status}`);
  return data;
}

// ─── COMPONENTES COMPARTIDOS ──────────────────────────────────────────────────
// Logo usa asset local para funcionar sin conexión
function LogoVidalsa({ size = 40 }) {
  return (
    <Image
      source={LOGO_LOCAL}
      style={{
        height: size,
        maxWidth: "90%",
        width: size * 5.5,
        resizeMode: "contain",
      }}
    />
  );
}

function TopHeader({ onOpenMenu }) {
  return (
    <View style={styles.topHeaderPremium}>
      <LogoVidalsa size={42} />
      <TouchableOpacity onPress={onOpenMenu} style={{ padding: 8 }}>
        <MaterialIcons name="menu" size={32} color="#0067b1" />
      </TouchableOpacity>
    </View>
  );
}

// Helper para ítem del menú con MaterialIcons
function MenuItem({
  icon,
  label,
  onPress,
  color = "#334155",
  subItem = false,
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.menuItem,
        subItem && { paddingVertical: 10, paddingLeft: 4 },
      ]}
      activeOpacity={0.7}
    >
      <MaterialIcons
        name={icon}
        size={subItem ? 20 : 22}
        color={color}
        style={{ width: 32 }}
      />
      <Text
        style={[styles.menuItemText, { color, fontSize: subItem ? 14 : 15 }]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function DrawerMenu({ visible, onClose, onNavigate, onLogout, user }) {
  const { width } = Dimensions.get("window");
  const [configOpen, setConfigOpen] = useState(false);

  useEffect(() => {
    if (!visible) setConfigOpen(false);
  }, [visible]);

  if (!visible) return null;
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, flexDirection: "row" }}>
        {/* Fondo oscuro al tap cierra */}
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={onClose}
          activeOpacity={1}
        />

        {/* Panel deslizante */}
        <View
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: width * 0.78,
            backgroundColor: "#ffffff",
            paddingTop:
              Platform.OS === "android" ? StatusBar.currentHeight + 20 : 50,
            elevation: 20,
            shadowColor: "#000",
            shadowOffset: { width: -4, height: 0 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
          }}
        >
          {/* Logo + usuario */}
          <View
            style={{
              paddingHorizontal: 20,
              paddingBottom: 16,
              marginBottom: 4,
              borderBottomWidth: 1,
              borderBottomColor: "#f1f5f9",
            }}
          >
            <LogoVidalsa size={40} />
            {user && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 10,
                  gap: 6,
                  paddingRight: 10,
                }}
              >
                <MaterialIcons
                  name="account-circle"
                  size={18}
                  color="#64748b"
                />
                <Text
                  style={{ fontSize: 13, color: "#64748b", flexShrink: 1 }}
                  numberOfLines={1}
                >
                  {user.name || user.email || "Usuario"}
                </Text>
              </View>
            )}
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
              {/* Inicio — igual que web: "home" */}
              <MenuItem
                icon="home"
                label="Inicio"
                onPress={() => {
                  onNavigate("dashboard");
                  onClose();
                }}
              />

              {/* Vehículo — igual que web: "agriculture" */}
              <MenuItem
                icon="agriculture"
                label="Vehículo"
                onPress={() => {
                  onNavigate("equipos");
                  onClose();
                }}
              />

              {/* Recepción — igual que web: "local-shipping" */}
              <MenuItem
                icon="local-shipping"
                label="Recepción"
                onPress={() => {
                  onNavigate("movs");
                  onClose();
                }}
              />

              {/* Divisor */}
              <View
                style={{
                  height: 1,
                  backgroundColor: "#f1f5f9",
                  marginVertical: 8,
                }}
              />

              {/* Configuraciones — igual que web: "settings" */}
              <TouchableOpacity
                onPress={() => setConfigOpen(!configOpen)}
                style={[styles.menuItem, { justifyContent: "space-between" }]}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <MaterialIcons
                    name="settings"
                    size={22}
                    color="#334155"
                    style={{ width: 32 }}
                  />
                  <Text style={styles.menuItemText}>Configuraciones</Text>
                </View>
                <MaterialIcons
                  name={configOpen ? "expand-less" : "expand-more"}
                  size={20}
                  color="#94a3b8"
                />
              </TouchableOpacity>

              {configOpen && (
                <View
                  style={{
                    marginLeft: 20,
                    borderLeftWidth: 2,
                    borderLeftColor: "#e2e8f0",
                    paddingLeft: 8,
                    marginBottom: 4,
                  }}
                >
                  {/* Frentes — igual que web: "business" */}
                  <MenuItem
                    icon="business"
                    label="Frentes de Trabajo"
                    onPress={onClose}
                    subItem
                  />
                  {/* Catálogo — igual que web: "menu-book" */}
                  <MenuItem
                    icon="menu-book"
                    label="Catálogo de Modelos"
                    onPress={onClose}
                    subItem
                  />
                </View>
              )}

              {/* Consumibles — igual que web: "local-gas-station" */}
              <MenuItem
                icon="local-gas-station"
                label="Consumibles"
                onPress={onClose}
              />

              <View style={{ height: 40 }} />

              {/* Cerrar Sesión — igual que web: "logout" */}
              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: "#f1f5f9",
                  paddingTop: 16,
                  marginBottom: 30,
                }}
              >
                <MenuItem
                  icon="logout"
                  label="Cerrar Sesión"
                  onPress={() => {
                    onClose();
                    setTimeout(onLogout, 250);
                  }}
                  color="#ef4444"
                />
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
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [ultimaSync, setUltimaSync] = useState("");
  const [conteoLocal, setConteoLocal] = useState(0);
  const [serverIp, setServerIp] = useState("");
  const [mostrarIp, setMostrarIp] = useState(false);
  const [mostrarFormLogin, setMostrarFormLogin] = useState(false);

  useEffect(() => {
    (async () => {
      const fecha = await leerUltimaSincronizacion();
      if (fecha) {
        const d = new Date(fecha);
        setUltimaSync(d.toLocaleString("es-VE"));
      }
      const equipos = await leerEquiposLocal();
      setConteoLocal(equipos.length);
      const ip = await AsyncStorage.getItem("server_ip");
      if (ip) setServerIp(ip);
      else setServerIp(DEFAULT_SERVER);
      // Si NO hay datos locales, mostrar formulario de login directamente
      if (equipos.length === 0) setMostrarFormLogin(true);
    })();
  }, []);

  const guardarIp = async () => {
    const ipLimpia = serverIp.trim().replace(/\/+$/, "");
    if (!ipLimpia) {
      showModernAlert("Error", "Escribe una IP o dirección válida.");
      return;
    }
    await AsyncStorage.setItem("server_ip", ipLimpia);
    setMostrarIp(false);
    showModernAlert(
      "✅ Guardado",
      `Servidor configurado: ${ipLimpia}\n\nAhora intenta descargar los datos.`,
    );
  };

  const descargarDatos = async () => {
    setDescargando(true);
    try {
      const [equipos, frentes] = await Promise.all([
        api("GET", "/equipos"),
        api("GET", "/frentes"),
      ]);
      await guardarEquiposLocal(equipos);
      await guardarFrentesLocal(frentes);
      const fecha = new Date();
      setUltimaSync(fecha.toLocaleString("es-VE"));
      setConteoLocal(equipos.length);
      showModernAlert(
        "✅ Descarga Exitosa",
        `Se guardaron ${equipos.length} equipos y ${frentes.length} frentes.\n\nYa puedes trabajar sin internet.`,
      );
    } catch (e) {
      showModernAlert(
        "❌ Sin Conexión",
        "No se pudo conectar al servidor. Verifica que estás en la misma red WiFi.\n\nDetalle: " +
          e.message,
      );
    } finally {
      setDescargando(false);
    }
  };

  // ─── Modo offline: entrar sin servidor si hay datos locales ───
  const entrarSinConexion = async () => {
    try {
      // Intentar recuperar último usuario guardado
      const savedUser = await AsyncStorage.getItem("user");
      if (savedUser) {
        onLogin(JSON.parse(savedUser));
        return;
      }
      // Si no hay usuario guardado, crear uno local básico
      const usuarioOffline = {
        name: "Modo Offline",
        email: "offline@local",
        offline: true,
      };
      await AsyncStorage.setItem("user", JSON.stringify(usuarioOffline));
      await AsyncStorage.setItem("token", "offline_token");
      onLogin(usuarioOffline);
    } catch (e) {
      showModernAlert(
        "Error",
        "No se pudo entrar en modo offline: " + e.message,
      );
    }
  };

  const handleLogin = async () => {
    if (!correo.trim() || !password.trim()) {
      showModernAlert("Campos vacíos", "Ingresa tu correo y contraseña.");
      return;
    }
    setLoading(true);
    try {
      const data = await api("POST", "/login", {
        correo: correo.trim(),
        password,
      });
      await AsyncStorage.setItem("token", data.token);
      await AsyncStorage.setItem("user", JSON.stringify(data.user));
      // Descargar datos automáticamente tras login exitoso
      try {
        const [equipos, frentes] = await Promise.all([
          api("GET", "/equipos"),
          api("GET", "/frentes"),
        ]);
        await guardarEquiposLocal(equipos);
        await guardarFrentesLocal(frentes);
      } catch (_) {
        // Si falla la descarga post-login, continúa con datos locales existentes
      }
      onLogin(data.user);
    } catch (e) {
      showModernAlert("Error de acceso", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fdfbfb" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fdfbfb" />
      {/* Curva lateral azul — igual que la web */}
      <View style={styles.blueCurveDashboard} />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: 20,
        }}
      >
        {/* ── Tarjeta de Login ── */}
        <View style={styles.loginCardPremium}>
          {/* Logo local — no depende de internet */}
          <View
            style={{ alignItems: "center", marginBottom: 24, marginTop: 6 }}
          >
            <LogoVidalsa size={70} />
          </View>

          {/* ── Modo Offline: botón principal si hay datos ── */}
          {conteoLocal > 0 && !mostrarFormLogin && (
            <View style={{ alignItems: "center" }}>
              {/* Info de datos locales */}
              <View
                style={{
                  backgroundColor: "#f0fdf4",
                  borderRadius: 10,
                  padding: 12,
                  width: "100%",
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: "#bbf7d0",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: "#166534",
                    textAlign: "center",
                  }}
                >
                  📦 {conteoLocal} equipos disponibles offline
                </Text>
                {ultimaSync ? (
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#4ade80",
                      textAlign: "center",
                      marginTop: 3,
                    }}
                  >
                    Última sincronización: {ultimaSync}
                  </Text>
                ) : null}
              </View>

              {/* BOTÓN PRINCIPAL: Continuar sin conexión */}
              <TouchableOpacity
                style={{
                  backgroundColor: "#00004d",
                  borderRadius: 12,
                  paddingVertical: 16,
                  width: "100%",
                  alignItems: "center",
                  marginBottom: 12,
                  elevation: 4,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.2,
                  shadowRadius: 6,
                }}
                onPress={entrarSinConexion}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <MaterialIcons name="wifi-off" size={20} color="#fff" />
                  <Text
                    style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}
                  >
                    Continuar sin conexión
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Botón secundario: iniciar sesión con servidor */}
              <TouchableOpacity
                style={{
                  backgroundColor: "transparent",
                  borderRadius: 12,
                  paddingVertical: 12,
                  width: "100%",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "#cbd5e0",
                }}
                onPress={() => setMostrarFormLogin(true)}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <MaterialIcons name="wifi" size={16} color="#64748b" />
                  <Text
                    style={{
                      color: "#64748b",
                      fontWeight: "600",
                      fontSize: 14,
                    }}
                  >
                    Iniciar sesión con servidor
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Formulario de Login (online) ── */}
          {mostrarFormLogin && (
            <>
              {conteoLocal > 0 && (
                <TouchableOpacity
                  onPress={() => setMostrarFormLogin(false)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 16,
                    gap: 4,
                  }}
                >
                  <MaterialIcons name="arrow-back" size={16} color="#64748b" />
                  <Text style={{ color: "#64748b", fontSize: 13 }}>
                    Volver al modo offline
                  </Text>
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
                {loading ? (
                  <ActivityIndicator color={C.white} />
                ) : (
                  <Text style={styles.btnPremiumText}>Iniciar sesión</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Sección Offline / Descarga ── */}
        <View style={{ marginTop: 40, alignItems: "center" }}>
          <TouchableOpacity
            style={[
              styles.btnDownload,
              descargando && { opacity: 0.6 },
              {
                backgroundColor: "rgba(255,255,255,0.15)",
                borderColor: "rgba(255,255,255,0.4)",
                borderWidth: 1,
              },
            ]}
            onPress={descargarDatos}
            disabled={descargando}
          >
            {descargando ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <MaterialIcons name="cloud-download" size={16} color="#fff" />
                <Text style={styles.btnDownloadText}>
                  Descargar / Actualizar datos
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setMostrarIp(!mostrarIp)}
            style={{ marginTop: 16 }}
          >
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              ⚙️ Servidor: {serverIp || DEFAULT_SERVER}
            </Text>
          </TouchableOpacity>

          {mostrarIp && (
            <View style={styles.ipBox}>
              <TextInput
                style={styles.ipInput}
                placeholder={DEFAULT_SERVER}
                placeholderTextColor="#6ee7b7"
                value={serverIp}
                onChangeText={setServerIp}
                autoCapitalize="none"
                keyboardType="url"
              />
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
    OPERATIVO: { bg: "#dcfce7", color: "#166534" },
    INOPERATIVO: { bg: "#fee2e2", color: "#991b1b" },
    "EN MANTENIMIENTO": { bg: "#fef9c3", color: "#854d0e" },
  };
  const s = map[estado] || { bg: "#e2e8f0", color: "#475569" };
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.badgeText, { color: s.color }]}>
        {estado || "N/A"}
      </Text>
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
        <View
          style={{ paddingHorizontal: 20, paddingTop: 15, paddingBottom: 15 }}
        >
          <Text
            style={[
              styles.dashboardTitle,
              {
                fontSize: 22,
                marginTop: 0,
                marginBottom: 5,
                textAlign: "left",
              },
            ]}
          >
            Sistema de Gestión de{"\n"}Equipos Operacionales
          </Text>
        </View>
        <View style={styles.dashboardWidgetGroup}>
          <View style={styles.widgetPremium}>
            <View
              style={[styles.widgetIconBox, { backgroundColor: "#dbeafe" }]}
            >
              <Text style={{ fontSize: 24, color: "#1e3a8a" }}>🚛</Text>
            </View>
            <View style={{ marginLeft: 15, flex: 1 }}>
              <Text
                style={{ color: "#64748b", fontSize: 13, fontWeight: "600" }}
              >
                Por Confirmar
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "baseline",
                  marginTop: 5,
                }}
              >
                <Text
                  style={{
                    fontSize: 32,
                    fontWeight: "bold",
                    color: "#0f172a",
                    lineHeight: 32,
                  }}
                >
                  0
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: "#94a3b8",
                    marginLeft: 8,
                    marginBottom: 4,
                  }}
                >
                  | 0 Moviliz. Hoy
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.widgetPremium}>
            <View
              style={[styles.widgetIconBox, { backgroundColor: "#fef3c7" }]}
            >
              <Text style={{ fontSize: 24, color: "#d97706" }}>🔔</Text>
            </View>
            <View style={{ marginLeft: 15, flex: 1 }}>
              <Text
                style={{ color: "#64748b", fontSize: 13, fontWeight: "600" }}
              >
                Alertas Documentos
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "baseline",
                  marginTop: 5,
                }}
              >
                <Text
                  style={{
                    fontSize: 32,
                    fontWeight: "bold",
                    color: "#0f172a",
                    lineHeight: 32,
                  }}
                >
                  79
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: "#0f172a",
                    fontWeight: "700",
                    marginLeft: 8,
                    marginBottom: 4,
                  }}
                >
                  | Por Renovar
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.widgetPremium}>
            <View
              style={[styles.widgetIconBox, { backgroundColor: "#f1f5f9" }]}
            >
              <Text style={{ fontSize: 24 }}>📱</Text>
            </View>
            <View style={{ marginLeft: 15, flex: 1 }}>
              <Text
                style={{ color: "#64748b", fontSize: 13, fontWeight: "600" }}
              >
                Equipos Offline Guardados
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "baseline",
                  marginTop: 5,
                }}
              >
                <Text
                  style={{
                    fontSize: 32,
                    fontWeight: "bold",
                    color: "#0f172a",
                    lineHeight: 32,
                  }}
                >
                  {equiposCount}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: "#94a3b8",
                    marginLeft: 8,
                    marginBottom: 4,
                  }}
                >
                  | Sincronizados
                </Text>
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
  const [equipos, setEquipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroFrente, setFiltroFrente] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [equipoSel, setEquipoSel] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    inoperativos: 0,
    mantenimiento: 0,
  });

  // ─── FILTROS AVANZADOS ──────────────────────────────
  const [advancedFiltersVisible, setAdvancedFiltersVisible] = useState(false);
  const [advModelo, setAdvModelo] = useState("");
  const [advMarca, setAdvMarca] = useState("");
  const [advAnio, setAdvAnio] = useState("");
  const [advCategoria, setAdvCategoria] = useState("");
  const [advEstadoOp, setAdvEstadoOp] = useState("");

  // ── ACCIONES MENU Y MODALES ──
  const [menuAccionesVisible, setMenuAccionesVisible] = useState(false);
  const [modalDashboardVisible, setModalDashboardVisible] = useState(false);
  const [modalAnclajesVisible, setModalAnclajesVisible] = useState(false);
  const [modalSubActivosVisible, setModalSubActivosVisible] = useState(false);
  const [modalNuevoEquipoVisible, setModalNuevoEquipoVisible] = useState(false);
  // Documentos checkboxes
  const [chkPropiedad, setChkPropiedad] = useState(false);
  const [chkPoliza, setChkPoliza] = useState(false);
  const [chkRotc, setChkRotc] = useState(false);
  const [chkRacda, setChkRacda] = useState(false);

  // ── SELECCIÓN MÚLTIPLE DE EQUIPOS ──
  const [equiposSelect, setEquiposSelect] = useState([]);
  const toggleSelectEquipo = (item) => {
    setEquiposSelect((prev) => {
      const exists = prev.find((e) => e.id_equipo === item.id_equipo);
      if (exists) return prev.filter((e) => e.id_equipo !== item.id_equipo);
      return [...prev, item];
    });
  };

  const clearAdvancedFilters = () => {
    setAdvModelo("");
    setAdvMarca("");
    setAdvAnio("");
    setAdvCategoria("");
    setAdvEstadoOp("");
    setChkPropiedad(false);
    setChkPoliza(false);
    setChkRotc(false);
    setChkRacda(false);
    cargar();
  };

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      let data = await leerEquiposLocal(busqueda);
      if (filtroFrente)
        data = data.filter((e) =>
          String(e.frente || "")
            .toLowerCase()
            .includes(filtroFrente.toLowerCase()),
        );
      if (filtroTipo)
        data = data.filter((e) =>
          String(e.tipo || "")
            .toLowerCase()
            .includes(filtroTipo.toLowerCase()),
        );

      // Aplicar Filtros Avanzados a la data local si están definidos
      if (advModelo)
        data = data.filter((e) =>
          String(e.modelo || "")
            .toLowerCase()
            .includes(advModelo.toLowerCase()),
        );
      if (advMarca)
        data = data.filter((e) =>
          String(e.marca || "")
            .toLowerCase()
            .includes(advMarca.toLowerCase()),
        );
      if (advAnio)
        data = data.filter((e) => String(e.anio || "") === String(advAnio));
      if (advCategoria)
        data = data.filter(
          (e) =>
            String(e.categoria || "").toUpperCase() ===
            advCategoria.toUpperCase(),
        );
      if (advEstadoOp)
        data = data.filter(
          (e) =>
            String(e.estado || "").toUpperCase() === advEstadoOp.toUpperCase(),
        );

      // Simulamos la lógica de documentos (si el checkbox está on, debe tener algún valor;
      // si en tu app móvil no guardas el doc como boolean puedes omitirlo o ajustarlo. Si lo guardas:
      if (chkPropiedad)
        data = data.filter(
          (e) =>
            e.propietario && e.propietario !== "N/A" && e.propietario !== "",
        );
      if (chkPoliza)
        data = data.filter(
          (e) =>
            e.tiene_poliza === 1 ||
            e.tiene_poliza === "1" ||
            e.tiene_poliza === true,
        );
      // Nota: Si rotc/racda no están en la data offline, este filtro podría devolver vacío.
      // Dependerá de tu esquema SQLite.

      setStats({
        total: data.length,
        inoperativos: data.filter((e) => e.estado === "INOPERATIVO").length,
        mantenimiento: data.filter((e) => e.estado === "EN MANTENIMIENTO")
          .length,
      });

      if (filtroEstado) data = data.filter((e) => e.estado === filtroEstado);
      setEquipos(data);
    } catch (_) {
      showModernAlert("Error", "No se pudo leer los datos locales.");
    } finally {
      setLoading(false);
    }
  }, [
    busqueda,
    filtroFrente,
    filtroTipo,
    filtroEstado,
    advModelo,
    advMarca,
    advAnio,
    advCategoria,
    advEstadoOp,
    chkPropiedad,
    chkPoliza,
    chkRotc,
    chkRacda,
  ]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Status map — matches web icons exactly
  const estadoMap = {
    OPERATIVO: { color: "#16a34a", icon: "check-circle", label: "Operativo" },
    INOPERATIVO: { color: "#dc2626", icon: "cancel", label: "Inoperativo" },
    "EN MANTENIMIENTO": {
      color: "#d97706",
      icon: "engineering",
      label: "Mantenimiento",
    },
    DESINCORPORADO: {
      color: "#475569",
      icon: "archive",
      label: "Desincorporado",
    },
  };
  const getEstado = (e) =>
    estadoMap[e] || { color: "#475569", icon: "help", label: e || "N/A" };

  const renderItem = ({ item }) => {
    const est = getEstado(item.estado);
    const isSelected = equiposSelect.find(
      (e) => e.id_equipo === item.id_equipo,
    );
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        delayLongPress={250}
        onLongPress={() => toggleSelectEquipo(item)}
        onPress={() => {
          if (equiposSelect.length > 0) toggleSelectEquipo(item);
          else {
            handleVerDetalles(item);
          }
        }}
        style={[
          styles.equipoCard,
          isSelected && {
            borderColor: "#3b82f6",
            borderWidth: 2,
            backgroundColor: "#eff6ff",
          },
        ]}
      >
        {/* Checkmark Overly if selected */}
        {isSelected && (
          <View
            style={{ position: "absolute", top: 10, right: 10, zIndex: 10 }}
          >
            <MaterialIcons name="check-circle" size={24} color="#3b82f6" />
          </View>
        )}
        {/* TOP ROW: Frente (small upper left) */}
        <View style={{ marginBottom: 4 }}>
          <Text
            style={{
              fontSize: 10,
              fontWeight: "700",
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: 0.3,
            }}
            numberOfLines={2}
          >
            {item.frente || "SIN ASIGNAR"}
          </Text>
        </View>

        {/* BODY: image placeholder (left) + data column (right) */}
        <View
          style={{ flexDirection: "row", gap: 18, alignItems: "flex-start" }}
        >
          {/* placeholder igual al web: mas grande */}
          <View
            style={{
              width: 65,
              height: 65,
              backgroundColor: "#f8fafc",
              borderRadius: 6,
              borderWidth: 1,
              borderColor: "#e2e8f0",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcons
              name="image-not-supported"
              size={28}
              color="#cbd5e1"
            />
          </View>
          {/* Datos igual al web: uno debajo del otro alineados */}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "800",
                color: "#000",
                textTransform: "uppercase",
                marginBottom: 2,
              }}
            >
              {item.tipo || "—"}
            </Text>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "800",
                color: "#0f172a",
                marginBottom: 1,
              }}
            >
              {item.marca || "—"}
            </Text>
            <Text style={{ fontSize: 13, color: "#718096", marginBottom: 6 }}>
              {item.modelo || "—"}
            </Text>
            {item.serial_chasis ? (
              <Text style={styles.serialLine}>
                <Text style={styles.serialKey}>S: </Text>
                {item.serial_chasis}
              </Text>
            ) : null}
            {item.serial_motor ? (
              <Text style={styles.serialLine}>
                <Text style={styles.serialKey}>M: </Text>
                {item.serial_motor}
              </Text>
            ) : null}
            {item.placa && item.placa !== "S/P" ? (
              <Text style={[styles.serialLine, { color: "#0067b1" }]}>
                <Text style={[styles.serialKey, { color: "#0067b1" }]}>
                  P:{" "}
                </Text>
                {item.placa}
              </Text>
            ) : (
              <Text
                style={{
                  fontSize: 12,
                  color: "#a0aec0",
                  fontStyle: "italic",
                  marginVertical: 2,
                }}
              >
                Sin Placa
              </Text>
            )}
          </View>
        </View>

        {/* FOOTER: status pill (icon + label + chevron) + dark navy eye button */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 6,
            borderTopWidth: 1,
            borderTopColor: "#f1f5f9",
            paddingTop: 8,
            gap: 10,
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              borderWidth: 1,
              borderColor: "#e2e8f0",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              backgroundColor: "#fff",
              gap: 6,
            }}
          >
            <MaterialIcons name={est.icon} size={16} color={est.color} />
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: "#334155",
                flex: 1,
              }}
            >
              {est.label}
            </Text>
            <MaterialIcons name="expand-more" size={18} color="#94a3b8" />
          </View>
          <TouchableOpacity
            style={{
              backgroundColor: "#00004d",
              borderRadius: 10,
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={() => {
              handleVerDetalles(item);
            }}
          >
            <MaterialIcons name="visibility" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <TopHeader onOpenMenu={onOpenMenu} />

      {/* Título */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 6,
          backgroundColor: "#fff",
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: "900", color: "#0f172a" }}>
          Gestión de Equipos y Maquinaria
        </Text>
      </View>

      {/* Filtros + Acciones + Consolidado — igual web responsive */}
      <View
        style={{
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: 10,
          backgroundColor: "#fff",
          borderBottomWidth: 1,
          borderBottomColor: "#f1f5f9",
          gap: 8,
        }}
      >
        {/* Filtrar Frente */}
        <View
          style={[
            styles.filterPill,
            filtroFrente
              ? { borderColor: "#0067b1", backgroundColor: "#e1effa" }
              : {},
          ]}
        >
          <MaterialIcons
            name="search"
            size={18}
            color="#94a3b8"
            style={{ marginRight: 4 }}
          />
          <TextInput
            style={{
              flex: 1,
              fontSize: 13,
              color: "#1e293b",
              paddingVertical: 0,
            }}
            placeholder="Filtrar Frente..."
            placeholderTextColor="#94a3b8"
            value={filtroFrente}
            onChangeText={setFiltroFrente}
          />
          {filtroFrente ? (
            <TouchableOpacity onPress={() => setFiltroFrente("")}>
              <MaterialIcons name="close" size={18} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filtrar Tipo */}
        <View
          style={[
            styles.filterPill,
            filtroTipo
              ? { borderColor: "#0067b1", backgroundColor: "#e1effa" }
              : {},
          ]}
        >
          <MaterialIcons
            name="search"
            size={18}
            color="#94a3b8"
            style={{ marginRight: 4 }}
          />
          <TextInput
            style={{
              flex: 1,
              fontSize: 13,
              color: "#1e293b",
              paddingVertical: 0,
            }}
            placeholder="Filtrar Tipo..."
            placeholderTextColor="#94a3b8"
            value={filtroTipo}
            onChangeText={setFiltroTipo}
          />
          {filtroTipo ? (
            <TouchableOpacity onPress={() => setFiltroTipo("")}>
              <MaterialIcons name="close" size={18} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Buscar Seriales + botón filter_list */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={[styles.filterPill, { flex: 1 }]}>
            <MaterialIcons
              name="search"
              size={18}
              color="#94a3b8"
              style={{ marginRight: 4 }}
            />
            <TextInput
              style={{
                flex: 1,
                fontSize: 13,
                color: "#1e293b",
                paddingVertical: 0,
              }}
              placeholder="Buscar Seriales"
              placeholderTextColor="#94a3b8"
              value={busqueda}
              onChangeText={setBusqueda}
            />
            {busqueda ? (
              <TouchableOpacity onPress={() => setBusqueda("")}>
                <MaterialIcons name="close" size={18} color="#94a3b8" />
              </TouchableOpacity>
            ) : null}
          </View>
          {/* Botón filtro avanzado */}
          <View style={{ position: "relative", zIndex: 100 }}>
            <TouchableOpacity
              onPress={() => setAdvancedFiltersVisible(!advancedFiltersVisible)}
              style={{
                width: 45,
                height: 45,
                borderWidth: 1,
                borderColor: advancedFiltersVisible ? "#0067b1" : "#cbd5e0",
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: advancedFiltersVisible ? "#e1effa" : "#fbfcfd",
              }}
            >
              <MaterialIcons
                name="filter-list"
                size={22}
                color={advancedFiltersVisible ? "#0067b1" : "#64748b"}
              />
            </TouchableOpacity>

            {/* Panel flotante de Filtros Avanzados */}
            {advancedFiltersVisible && (
              <View
                style={{
                  position: "absolute",
                  top: 52,
                  right: 0,
                  width: 300,
                  backgroundColor: "#e2e8f0",
                  borderRadius: 12,
                  padding: 15,
                  zIndex: 200,
                  elevation: 10,
                  shadowColor: "#000",
                  shadowOpacity: 0.15,
                  shadowRadius: 10,
                  shadowOffset: { height: 5, width: 0 },
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 15,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: "#334155",
                    }}
                  >
                    Filtros Avanzados
                  </Text>
                  <TouchableOpacity onPress={clearAdvancedFilters}>
                    <Text
                      style={{
                        fontSize: 11,
                        color: "#64748b",
                        textDecorationLine: "underline",
                      }}
                    >
                      Limpiar Todo
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Modelo */}
                <View style={{ marginBottom: 12 }}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: "#64748b",
                      marginBottom: 4,
                    }}
                  >
                    Modelo
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: "#fff",
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: "#e2e8f0",
                      paddingHorizontal: 8,
                      height: 32,
                    }}
                  >
                    <MaterialIcons name="search" size={16} color="#94a3b8" />
                    <TextInput
                      style={{
                        flex: 1,
                        fontSize: 12,
                        color: "#1e293b",
                        paddingVertical: 0,
                        marginLeft: 4,
                      }}
                      placeholder="Escribir modelo..."
                      placeholderTextColor="#94a3b8"
                      value={advModelo}
                      onChangeText={setAdvModelo}
                    />
                  </View>
                </View>

                {/* Marca */}
                <View style={{ marginBottom: 12 }}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: "#64748b",
                      marginBottom: 4,
                    }}
                  >
                    Marca
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: "#fff",
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: "#e2e8f0",
                      paddingHorizontal: 8,
                      height: 32,
                    }}
                  >
                    <MaterialIcons name="search" size={16} color="#94a3b8" />
                    <TextInput
                      style={{
                        flex: 1,
                        fontSize: 12,
                        color: "#1e293b",
                        paddingVertical: 0,
                        marginLeft: 4,
                      }}
                      placeholder="Escribir marca..."
                      placeholderTextColor="#94a3b8"
                      value={advMarca}
                      onChangeText={setAdvMarca}
                    />
                  </View>
                </View>

                {/* Año */}
                <View style={{ marginBottom: 12 }}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: "#64748b",
                      marginBottom: 4,
                    }}
                  >
                    Año
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: "#fff",
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: "#e2e8f0",
                      paddingHorizontal: 8,
                      height: 32,
                    }}
                  >
                    <MaterialIcons name="search" size={16} color="#94a3b8" />
                    <TextInput
                      keyboardType="numeric"
                      style={{
                        flex: 1,
                        fontSize: 12,
                        color: "#1e293b",
                        paddingVertical: 0,
                        marginLeft: 4,
                      }}
                      placeholder="Escribir año..."
                      placeholderTextColor="#94a3b8"
                      value={advAnio}
                      onChangeText={setAdvAnio}
                    />
                  </View>
                </View>

                {/* Categoria Flota */}
                <View style={{ marginBottom: 12 }}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: "#64748b",
                      marginBottom: 4,
                    }}
                  >
                    Categoría Flota
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: "#fff",
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: "#e2e8f0",
                      paddingHorizontal: 8,
                      height: 32,
                    }}
                  >
                    <MaterialIcons
                      name="local-shipping"
                      size={16}
                      color="#94a3b8"
                    />
                    <TextInput
                      style={{
                        flex: 1,
                        fontSize: 12,
                        color: "#1e293b",
                        paddingVertical: 0,
                        marginLeft: 4,
                      }}
                      placeholder="FLOTA LIVIANA / PESADA"
                      placeholderTextColor="#94a3b8"
                      value={advCategoria}
                      onChangeText={setAdvCategoria}
                    />
                  </View>
                </View>

                {/* Estado Operativo */}
                <View style={{ marginBottom: 12 }}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: "#64748b",
                      marginBottom: 4,
                    }}
                  >
                    Estado Operativo
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: "#fff",
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: "#e2e8f0",
                      paddingHorizontal: 8,
                      height: 32,
                    }}
                  >
                    <MaterialIcons name="info" size={16} color="#94a3b8" />
                    <TextInput
                      style={{
                        flex: 1,
                        fontSize: 12,
                        color: "#1e293b",
                        paddingVertical: 0,
                        marginLeft: 4,
                      }}
                      placeholder="OPERATIVO / INOPERATIVO..."
                      placeholderTextColor="#94a3b8"
                      value={advEstadoOp}
                      onChangeText={setAdvEstadoOp}
                    />
                  </View>
                </View>

                {/* Documentación (Checkboxes SIMULADOS) */}
                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: "#cbd5e1",
                    paddingTop: 10,
                    marginTop: 5,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: "#64748b",
                      marginBottom: 8,
                    }}
                  >
                    Documentación Cargada
                  </Text>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}
                  >
                    <TouchableOpacity
                      onPress={() => setChkPropiedad(!chkPropiedad)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        width: "45%",
                        marginBottom: 6,
                      }}
                    >
                      <MaterialIcons
                        name={
                          chkPropiedad ? "check-box" : "check-box-outline-blank"
                        }
                        size={18}
                        color={chkPropiedad ? "#0067b1" : "#94a3b8"}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={{ fontSize: 12, color: "#334155" }}>
                        Propiedad
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setChkPoliza(!chkPoliza)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        width: "45%",
                        marginBottom: 6,
                      }}
                    >
                      <MaterialIcons
                        name={
                          chkPoliza ? "check-box" : "check-box-outline-blank"
                        }
                        size={18}
                        color={chkPoliza ? "#0067b1" : "#94a3b8"}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={{ fontSize: 12, color: "#334155" }}>
                        Póliza
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setChkRotc(!chkRotc)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        width: "45%",
                        marginBottom: 6,
                      }}
                    >
                      <MaterialIcons
                        name={chkRotc ? "check-box" : "check-box-outline-blank"}
                        size={18}
                        color={chkRotc ? "#0067b1" : "#94a3b8"}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={{ fontSize: 12, color: "#334155" }}>
                        ROTC
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setChkRacda(!chkRacda)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        width: "45%",
                        marginBottom: 6,
                      }}
                    >
                      <MaterialIcons
                        name={
                          chkRacda ? "check-box" : "check-box-outline-blank"
                        }
                        size={18}
                        color={chkRacda ? "#0067b1" : "#94a3b8"}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={{ fontSize: 12, color: "#334155" }}>
                        RACDA
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => {
                    setAdvancedFiltersVisible(false);
                    cargar();
                  }}
                  style={{
                    backgroundColor: "#0067b1",
                    borderRadius: 8,
                    alignItems: "center",
                    paddingVertical: 10,
                    marginTop: 15,
                  }}
                >
                  <Text
                    style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}
                  >
                    Aplicar Filtros
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Botón Acciones móvil */}
        <View style={{ position: "relative", zIndex: 90 }}>
          <TouchableOpacity
            onPress={() => setMenuAccionesVisible(!menuAccionesVisible)}
            style={{
              backgroundColor: "#0067b1",
              borderRadius: 12,
              height: 45,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <MaterialIcons name="settings" size={20} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
              Acciones
            </Text>
            <MaterialIcons name="expand-more" size={20} color="#fff" />
          </TouchableOpacity>

          {menuAccionesVisible && (
            <View
              style={{
                position: "absolute",
                top: 52,
                right: 0,
                width: 220,
                backgroundColor: "#fff",
                borderRadius: 12,
                padding: 8,
                zIndex: 200,
                elevation: 15,
                shadowColor: "#000",
                shadowOpacity: 0.15,
                shadowRadius: 10,
                shadowOffset: { height: 5, width: 0 },
                borderWidth: 1,
                borderColor: "#e2e8f0",
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  setMenuAccionesVisible(false);
                  setModalDashboardVisible(true);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 10,
                  borderRadius: 8,
                  marginBottom: 4,
                }}
              >
                <View
                  style={{
                    backgroundColor: "#eff6ff",
                    padding: 6,
                    borderRadius: 6,
                    marginRight: 10,
                  }}
                >
                  <MaterialIcons name="poll" size={18} color="#3b82f6" />
                </View>
                <Text
                  style={{ fontSize: 13, fontWeight: "500", color: "#475569" }}
                >
                  Dashboard de Flota
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setMenuAccionesVisible(false);
                  setModalAnclajesVisible(true);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 10,
                  borderRadius: 8,
                  marginBottom: 4,
                }}
              >
                <View
                  style={{
                    backgroundColor: "#f0fdfa",
                    padding: 6,
                    borderRadius: 6,
                    marginRight: 10,
                  }}
                >
                  <MaterialIcons name="link" size={18} color="#0d9488" />
                </View>
                <Text
                  style={{ fontSize: 13, fontWeight: "500", color: "#475569" }}
                >
                  Configurar Anclajes
                </Text>
              </TouchableOpacity>

              <View
                style={{
                  height: 1,
                  backgroundColor: "#f1f5f9",
                  marginVertical: 4,
                }}
              />

              <TouchableOpacity
                onPress={() => {
                  setMenuAccionesVisible(false);
                  setModalSubActivosVisible(true);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 10,
                  borderRadius: 8,
                  marginBottom: 4,
                }}
              >
                <View
                  style={{
                    backgroundColor: "#fffbeb",
                    padding: 6,
                    borderRadius: 6,
                    marginRight: 10,
                  }}
                >
                  <MaterialIcons
                    name="construction"
                    size={18}
                    color="#d97706"
                  />
                </View>
                <Text
                  style={{ fontSize: 13, fontWeight: "500", color: "#475569" }}
                >
                  Sub-activos
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setMenuAccionesVisible(false);
                  setModalNuevoEquipoVisible(true);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 10,
                  borderRadius: 8,
                }}
              >
                <View
                  style={{
                    backgroundColor: "#eff6ff",
                    padding: 6,
                    borderRadius: 6,
                    marginRight: 10,
                  }}
                >
                  <MaterialIcons name="add-circle" size={18} color="#0ea5e9" />
                </View>
                <Text
                  style={{ fontSize: 13, fontWeight: "500", color: "#475569" }}
                >
                  Nuevo Equipo
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* CONSOLIDADO DE EQUIPOS — barra azul oscura igual que la web */}
        <View
          style={{
            backgroundColor: "#1e293b",
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 9,
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <MaterialIcons
            name="pie-chart"
            size={13}
            color="rgba(255,255,255,0.65)"
          />
          <Text
            style={{
              fontSize: 9,
              fontWeight: "800",
              color: "rgba(255,255,255,0.65)",
              textTransform: "uppercase",
              letterSpacing: 1,
              flex: 1,
            }}
          >
            Consolidado de Equipos
          </Text>
          {/* TOTAL */}
          <TouchableOpacity
            onPress={() => setFiltroEstado("")}
            style={[
              {
                backgroundColor: "rgba(255,255,255,0.15)",
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 4,
              },
              filtroEstado === "" && {
                backgroundColor: "#3b82f6",
                borderColor: "#60a5fa",
                borderWidth: 1,
              },
            ]}
          >
            <Text
              style={[
                { color: "#fff", fontWeight: "800", fontSize: 13 },
                filtroEstado === "" && { color: "#fff" },
              ]}
            >
              {stats.total}{" "}
              <Text style={{ fontWeight: "600", fontSize: 11 }}>TOTAL</Text>
            </Text>
          </TouchableOpacity>
          {/* Inoperativos */}
          <TouchableOpacity
            onPress={() => setFiltroEstado("INOPERATIVO")}
            style={[
              {
                backgroundColor: "rgba(239,68,68,0.18)",
                borderRadius: 20,
                paddingHorizontal: 9,
                paddingVertical: 4,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                borderWidth: 1,
                borderColor: "rgba(239,68,68,0.3)",
              },
              filtroEstado === "INOPERATIVO" && {
                backgroundColor: "rgba(239,68,68,0.9)",
              },
            ]}
          >
            <MaterialIcons
              name="cancel"
              size={13}
              color={filtroEstado === "INOPERATIVO" ? "#fff" : "#f87171"}
            />
            <Text
              style={[
                { color: "#f87171", fontWeight: "700", fontSize: 11 },
                filtroEstado === "INOPERATIVO" && { color: "#fff" },
              ]}
            >
              {stats.inoperativos} Inoperativos
            </Text>
          </TouchableOpacity>
          {/* Mantenimiento */}
          <TouchableOpacity
            onPress={() => setFiltroEstado("EN MANTENIMIENTO")}
            style={[
              {
                backgroundColor: "rgba(245,158,11,0.18)",
                borderRadius: 20,
                paddingHorizontal: 8,
                paddingVertical: 4,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                borderWidth: 1,
                borderColor: "rgba(245,158,11,0.3)",
              },
              filtroEstado === "EN MANTENIMIENTO" && {
                backgroundColor: "rgba(245,158,11,0.9)",
              },
            ]}
          >
            <MaterialIcons
              name="engineering"
              size={13}
              color={filtroEstado === "EN MANTENIMIENTO" ? "#fff" : "#fbbf24"}
            />
            <Text
              style={[
                { color: "#fbbf24", fontWeight: "700", fontSize: 11 },
                filtroEstado === "EN MANTENIMIENTO" && { color: "#fff" },
              ]}
            >
              {stats.mantenimiento}
            </Text>
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
          showsVerticalScrollIndicator={true}
          data={equipos}
          keyExtractor={(item) => String(item.id_equipo)}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={[styles.centered, { paddingVertical: 60 }]}>
              <MaterialIcons name="filter-alt" size={48} color="#cbd5e0" />
              <Text
                style={[
                  styles.emptyText,
                  { marginTop: 10, textAlign: "center" },
                ]}
              >
                {busqueda || filtroFrente || filtroTipo
                  ? "Sin resultados con estos filtros."
                  : "Seleccione un filtro para ver los equipos."}
              </Text>
            </View>
          }
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
        />
      )}

      {/* ── Modal de Detalles (igual que web) ── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { maxHeight: "92%" }]}>
            {equipoSel && (
              <>
                {/* Header azul oscuro: CASILLERO + Placa / Serial (igual que la web) */}
                <View
                  style={{
                    backgroundColor: "#00004d",
                    paddingHorizontal: 22,
                    paddingVertical: 20,
                    borderTopLeftRadius: 20,
                    borderTopRightRadius: 20,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: "#fff",
                        fontSize: 20,
                        fontWeight: "900",
                        letterSpacing: 0.5,
                      }}
                    >
                      CASILLERO
                    </Text>
                    <Text
                      style={{
                        color: "rgba(255,255,255,0.8)",
                        fontSize: 13,
                        marginTop: 4,
                      }}
                    >
                      Placa: {equipoSel.placa || "S/P"} - Serial:{" "}
                      {equipoSel.serial_chasis || "S/S"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setModalVisible(false)}
                    style={{
                      backgroundColor: "rgba(255,255,255,0.15)",
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{ color: "#fff", fontSize: 18, lineHeight: 20 }}
                    >
                      ✕
                    </Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={{ padding: 16 }}
                  contentContainerStyle={{ paddingBottom: 10 }}
                >
                  <AccordionSection
                    title="📄 Documentación Legal y Soportes"
                    initialOpen={true}
                  >
                    <DetalleRow
                      label="Titular del Registro"
                      valor={equipoSel.propietario}
                    />
                    <DetalleRow
                      label="Placa Identificadora"
                      valor={equipoSel.placa}
                    />
                    <View style={styles.detalleRow}>
                      <Text style={styles.detalleLabel}>Nro. Documento</Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <Text style={styles.detalleValor}>
                          {equipoSel.nro_documento || "—"}
                        </Text>
                        {equipoSel.DOC_PROPIEDAD && (
                            <TouchableOpacity onPress={() => Linking.openURL(equipoSel.DOC_PROPIEDAD)}>
                                <MaterialIcons
                                    name="picture-as-pdf"
                                    size={24}
                                    color="#ef4444"
                                />
                            </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    <View style={styles.detalleRow}>
                      <Text style={styles.detalleLabel}>Póliza de Seguro</Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <Text style={styles.detalleValor}>
                           {equipoSel.DOC_POLIZA ? "Cargado" : "N/A"}
                        </Text>
                        {equipoSel.DOC_POLIZA && (
                             <TouchableOpacity onPress={() => Linking.openURL(equipoSel.DOC_POLIZA)}>
                                <MaterialIcons
                                    name="picture-as-pdf"
                                    size={24}
                                    color="#ef4444"
                                />
                            </TouchableOpacity>
                         )}
                      </View>
                    </View>
                    <View style={styles.detalleRow}>
                      <Text style={styles.detalleLabel}>Registro ROTC</Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <Text style={styles.detalleValor}>
                           {equipoSel.DOC_ROTC ? "Cargado" : "N/A"}
                        </Text>
                        {equipoSel.DOC_ROTC && (
                             <TouchableOpacity onPress={() => Linking.openURL(equipoSel.DOC_ROTC)}>
                                <MaterialIcons
                                    name="picture-as-pdf"
                                    size={24}
                                    color="#ef4444"
                                />
                            </TouchableOpacity>
                         )}
                      </View>
                    </View>
                    <View style={styles.detalleRow}>
                      <Text style={styles.detalleLabel}>Registro RACDA</Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <Text style={styles.detalleValor}>
                           {equipoSel.DOC_RACDA ? "Cargado" : "N/A"}
                        </Text>
                         {equipoSel.DOC_RACDA && (
                             <TouchableOpacity onPress={() => Linking.openURL(equipoSel.DOC_RACDA)}>
                                <MaterialIcons
                                    name="picture-as-pdf"
                                    size={24}
                                    color="#ef4444"
                                />
                            </TouchableOpacity>
                         )}
                      </View>
                    </View>
                  </AccordionSection>

                  <AccordionSection
                    title="ℹ️ Información General"
                    initialOpen={false}
                  >
                    <DetalleRow label="Tipo" valor={equipoSel.tipo} />
                    <DetalleRow label="Marca" valor={equipoSel.marca} />
                    <DetalleRow label="Modelo" valor={equipoSel.modelo} />
                    <DetalleRow label="Año" valor={equipoSel.anio} />
                    <DetalleRow label="Categoría" valor={equipoSel.categoria} />
                    <DetalleRow
                      label="Frente"
                      valor={equipoSel.frente || "Sin Asignar"}
                    />
                    <DetalleRow
                      label="Detalle Ubic."
                      valor={equipoSel.detalle_ubi}
                    />
                    <DetalleRow
                      label="Código / ID"
                      valor={equipoSel.codigo_patio}
                    />
                    <DetalleRow
                      label="Nº Etiqueta"
                      valor={equipoSel.nro_etiqueta}
                    />
                    <DetalleRow
                      label="Serial Motor"
                      valor={equipoSel.serial_motor}
                    />
                  </AccordionSection>
                </ScrollView>
              </>
            )}
            <TouchableOpacity
              style={[styles.btnPrimary, { margin: 16, marginTop: 4 }]}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.btnPrimaryText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── MODAL DASHBOARD DE FLOTA ── */}
      <Modal
        visible={modalDashboardVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalDashboardVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: 15,
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              overflow: "hidden",
              maxHeight: "90%",
              flex: 1,
            }}
          >
            <View
              style={{
                backgroundColor: "#00004d",
                padding: 18,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  flex: 1,
                }}
              >
                <View
                  style={{
                    backgroundColor: "rgba(59,130,246,0.2)",
                    padding: 8,
                    borderRadius: 10,
                  }}
                >
                  <MaterialIcons name="poll" size={24} color="#3b82f6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: "white", fontSize: 16, fontWeight: "700" }}
                  >
                    Dashboard de Flota
                  </Text>
                  <Text
                    style={{ color: "rgba(255,255,255,0.75)", fontSize: 11 }}
                  >
                    Métricas y estado general operativo
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setModalDashboardVisible(false)}
                style={{
                  backgroundColor: "rgba(255,255,255,0.1)",
                  padding: 6,
                  borderRadius: 20,
                }}
              >
                <MaterialIcons name="close" size={20} color="white" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={{ flex: 1, backgroundColor: "#f8fafc" }}
              contentContainerStyle={{ padding: 15 }}
            >
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 10,
                  justifyContent: "space-between",
                }}
              >
                <View
                  style={{
                    backgroundColor: "#fff",
                    borderRadius: 10,
                    padding: 15,
                    borderWidth: 1,
                    borderColor: "#e2e8f0",
                    width: "48%",
                    alignItems: "center",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.05,
                    shadowRadius: 3,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 28,
                      fontWeight: "900",
                      color: "#00004d",
                    }}
                  >
                    {stats.total}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#64748b",
                      textAlign: "center",
                      marginTop: 4,
                      fontWeight: "600",
                    }}
                  >
                    TOTAL EQUIPOS
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: "#fff",
                    borderRadius: 10,
                    padding: 15,
                    borderWidth: 1,
                    borderColor: "#e2e8f0",
                    width: "48%",
                    alignItems: "center",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.05,
                    shadowRadius: 3,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 28,
                      fontWeight: "900",
                      color: "#10b981",
                    }}
                  >
                    {stats.total - stats.inoperativos - stats.mantenimiento}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#64748b",
                      textAlign: "center",
                      marginTop: 4,
                      fontWeight: "600",
                    }}
                  >
                    OPERATIVOS
                  </Text>
                </View>
              </View>
              <View
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                  marginTop: 15,
                  height: 220,
                  justifyContent: "center",
                  alignItems: "center",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.05,
                  shadowRadius: 3,
                }}
              >
                <MaterialIcons name="pie-chart" size={60} color="#e2e8f0" />
                <Text
                  style={{
                    color: "#94a3b8",
                    fontSize: 13,
                    marginTop: 15,
                    fontWeight: "600",
                  }}
                >
                  Gráficos y Métricas Avanzadas
                </Text>
                <Text style={{ color: "#94a3b8", fontSize: 11, marginTop: 4 }}>
                  Disponible próximamente.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── MODAL CONFIGURAR ANCLAJES ── */}
      <Modal
        visible={modalAnclajesVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalAnclajesVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: 15,
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              overflow: "hidden",
              maxHeight: "90%",
              flex: 1,
            }}
          >
            <View
              style={{
                backgroundColor: "#00004d",
                padding: 18,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  flex: 1,
                }}
              >
                <View
                  style={{
                    backgroundColor: "rgba(13,148,136,0.2)",
                    padding: 8,
                    borderRadius: 10,
                  }}
                >
                  <MaterialIcons name="link" size={24} color="#14b8a6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: "white", fontSize: 16, fontWeight: "700" }}
                  >
                    Gestión de Anclajes
                  </Text>
                  <Text
                    style={{ color: "rgba(255,255,255,0.75)", fontSize: 11 }}
                  >
                    Vincular equipos a vehículos
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setModalAnclajesVisible(false)}
                style={{
                  backgroundColor: "rgba(255,255,255,0.1)",
                  padding: 6,
                  borderRadius: 20,
                }}
              >
                <MaterialIcons name="close" size={20} color="white" />
              </TouchableOpacity>
            </View>
            <View
              style={{
                padding: 12,
                backgroundColor: "#fff",
                borderBottomWidth: 1,
                borderBottomColor: "#e2e8f0",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "#cbd5e0",
                  borderRadius: 8,
                  height: 42,
                  paddingHorizontal: 12,
                  backgroundColor: "#fbfcfd",
                }}
              >
                <MaterialIcons name="search" size={20} color="#94a3b8" />
                <TextInput
                  placeholder="Buscar vehículos o cabezales anclables..."
                  style={{
                    flex: 1,
                    marginLeft: 8,
                    fontSize: 13,
                    color: "#1e293b",
                  }}
                />
              </View>
            </View>
            <ScrollView
              style={{ flex: 1, backgroundColor: "#f8fafc" }}
              contentContainerStyle={{ padding: 15 }}
            >
              <View
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 10,
                  padding: 15,
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                  marginBottom: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 2,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    backgroundColor: "#f1f5f9",
                    borderRadius: 8,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MaterialIcons
                    name="local-shipping"
                    size={22}
                    color="#64748b"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "800",
                      color: "#0f172a",
                    }}
                  >
                    CHUTO
                  </Text>
                  <Text
                    style={{ fontSize: 11, color: "#475569", marginTop: 2 }}
                  >
                    MACK VISIÓN - 2008
                  </Text>
                  <Text
                    style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}
                  >
                    A90AN2A
                  </Text>
                </View>
                <TouchableOpacity
                  style={{
                    backgroundColor: "#0d9488",
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 6,
                  }}
                >
                  <Text
                    style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}
                  >
                    Anclar
                  </Text>
                </TouchableOpacity>
              </View>
              <View
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 10,
                  padding: 15,
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                  marginBottom: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 2,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    backgroundColor: "#f1f5f9",
                    borderRadius: 8,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MaterialIcons
                    name="local-shipping"
                    size={22}
                    color="#64748b"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "800",
                      color: "#0f172a",
                    }}
                  >
                    CAMION CARGO 1721
                  </Text>
                  <Text
                    style={{ fontSize: 11, color: "#475569", marginTop: 2 }}
                  >
                    FORD - 2012
                  </Text>
                  <Text
                    style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}
                  >
                    A06AR9P
                  </Text>
                </View>
                <TouchableOpacity
                  style={{
                    backgroundColor: "#0d9488",
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 6,
                  }}
                >
                  <Text
                    style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}
                  >
                    Anclar
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── MODAL SUB-ACTIVOS ── */}
      <Modal
        visible={modalSubActivosVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalSubActivosVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: 15,
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              overflow: "hidden",
              maxHeight: "90%",
              flex: 1,
            }}
          >
            <View
              style={{
                backgroundColor: "#00004d",
                padding: 18,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  flex: 1,
                }}
              >
                <MaterialIcons name="construction" size={26} color="#f59e0b" />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: "white", fontSize: 16, fontWeight: "700" }}
                  >
                    Sub-activos
                  </Text>
                  <Text
                    style={{ color: "rgba(255,255,255,0.75)", fontSize: 11 }}
                  >
                    Herramientas y Equipos Menores
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setModalSubActivosVisible(false)}
                style={{
                  backgroundColor: "rgba(255,255,255,0.1)",
                  padding: 6,
                  borderRadius: 20,
                }}
              >
                <MaterialIcons name="close" size={20} color="white" />
              </TouchableOpacity>
            </View>
            <View
              style={{
                padding: 12,
                borderBottomWidth: 1,
                borderBottomColor: "#e2e8f0",
                backgroundColor: "#fff",
                gap: 10,
              }}
            >
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: "#cbd5e0",
                    borderRadius: 8,
                    height: 42,
                    paddingHorizontal: 12,
                    justifyContent: "center",
                    backgroundColor: "#fbfcfd",
                  }}
                >
                  <Text style={{ fontSize: 13, color: "#64748b" }}>
                    Todos los tipos ▼
                  </Text>
                </View>
                <View
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: "#cbd5e0",
                    borderRadius: 8,
                    height: 42,
                    paddingHorizontal: 12,
                    justifyContent: "center",
                    backgroundColor: "#fbfcfd",
                  }}
                >
                  <Text style={{ fontSize: 13, color: "#64748b" }}>
                    Todos los frentes ▼
                  </Text>
                </View>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "#cbd5e0",
                  borderRadius: 8,
                  height: 42,
                  paddingHorizontal: 12,
                  backgroundColor: "#fff",
                }}
              >
                <MaterialIcons name="search" size={20} color="#94a3b8" />
                <TextInput
                  placeholder="Buscar serial..."
                  style={{
                    flex: 1,
                    marginLeft: 8,
                    fontSize: 13,
                    color: "#1e293b",
                  }}
                />
              </View>
            </View>
            <ScrollView
              style={{ flex: 1, backgroundColor: "#f8fafc" }}
              contentContainerStyle={{ padding: 15 }}
            >
              <View
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                  padding: 15,
                  marginBottom: 12,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 2,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "800",
                      color: "#00004d",
                      textTransform: "uppercase",
                    }}
                  >
                    MAQUINA SOLDADURA
                  </Text>
                  <Text
                    style={{
                      fontSize: 10,
                      color: "#16a34a",
                      backgroundColor: "#f0fdf4",
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 12,
                      fontWeight: "700",
                    }}
                  >
                    Operativo
                  </Text>
                </View>
                <Text
                  style={{ fontSize: 12, color: "#475569", marginBottom: 2 }}
                >
                  Lincoln · Ranger 300D · 2022
                </Text>
                <Text style={{ fontSize: 11, color: "#94a3b8" }}>
                  Serial:{" "}
                  <Text style={{ fontWeight: "700", color: "#64748b" }}>
                    MS-425115
                  </Text>
                </Text>
                <View
                  style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTopWidth: 1,
                    borderTopColor: "#f1f5f9",
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <MaterialIcons name="place" size={14} color="#94a3b8" />
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#64748b",
                      marginLeft: 4,
                      fontWeight: "600",
                    }}
                  >
                    ASIGNACION PDVSA DAL
                  </Text>
                </View>
              </View>

              <View
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                  padding: 15,
                  marginBottom: 12,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 2,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "800",
                      color: "#00004d",
                      textTransform: "uppercase",
                    }}
                  >
                    CONTENEDOR
                  </Text>
                  <Text
                    style={{
                      fontSize: 10,
                      color: "#dc2626",
                      backgroundColor: "#fef2f2",
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 12,
                      fontWeight: "700",
                    }}
                  >
                    Inoperativo
                  </Text>
                </View>
                <Text
                  style={{ fontSize: 12, color: "#475569", marginBottom: 2 }}
                >
                  Generico · 20 Pies · 2020
                </Text>
                <Text style={{ fontSize: 11, color: "#94a3b8" }}>
                  Serial:{" "}
                  <Text style={{ fontWeight: "700", color: "#64748b" }}>
                    CXZCZSC
                  </Text>
                </Text>
                <View
                  style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTopWidth: 1,
                    borderTopColor: "#f1f5f9",
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <MaterialIcons name="link" size={14} color="#94a3b8" />
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#64748b",
                      marginLeft: 4,
                      fontWeight: "600",
                    }}
                  >
                    Anclado a: LOWBOY (LZZGX)
                  </Text>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── MODAL NUEVO EQUIPO ── */}
      <Modal
        visible={modalNuevoEquipoVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalNuevoEquipoVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: 15,
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              overflow: "hidden",
              maxHeight: "90%",
              flex: 1,
            }}
          >
            <View
              style={{
                backgroundColor: "#00004d",
                padding: 18,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  flex: 1,
                }}
              >
                <View
                  style={{
                    backgroundColor: "rgba(14,165,233,0.2)",
                    padding: 8,
                    borderRadius: 10,
                  }}
                >
                  <MaterialIcons name="add-circle" size={24} color="#0ea5e9" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: "white", fontSize: 16, fontWeight: "700" }}
                  >
                    Nuevo Equipo
                  </Text>
                  <Text
                    style={{ color: "rgba(255,255,255,0.75)", fontSize: 11 }}
                  >
                    Registrar maquinaria o vehículo
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setModalNuevoEquipoVisible(false)}
                style={{
                  backgroundColor: "rgba(255,255,255,0.1)",
                  padding: 6,
                  borderRadius: 20,
                }}
              >
                <MaterialIcons name="close" size={20} color="white" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={{ flex: 1, backgroundColor: "#fff" }}
              contentContainerStyle={{ padding: 20 }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "800",
                  color: "#64748b",
                  marginBottom: 6,
                  textTransform: "uppercase",
                }}
              >
                TIPO DE EQUIPO *
              </Text>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: "#cbd5e0",
                  borderRadius: 8,
                  height: 45,
                  paddingHorizontal: 12,
                  justifyContent: "center",
                  marginBottom: 18,
                  backgroundColor: "#fbfcfd",
                }}
              >
                <Text style={{ fontSize: 13, color: "#94a3b8" }}>
                  Seleccionar tipo de equipo...
                </Text>
              </View>

              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "800",
                  color: "#64748b",
                  marginBottom: 6,
                  textTransform: "uppercase",
                }}
              >
                MARCA
              </Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: "#cbd5e0",
                  borderRadius: 8,
                  height: 45,
                  paddingHorizontal: 12,
                  fontSize: 13,
                  marginBottom: 18,
                  backgroundColor: "#fbfcfd",
                  color: "#1e293b",
                }}
                placeholder="Ej: Caterpillar"
                placeholderTextColor="#94a3b8"
              />

              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "800",
                  color: "#64748b",
                  marginBottom: 6,
                  textTransform: "uppercase",
                }}
              >
                MODELO
              </Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: "#cbd5e0",
                  borderRadius: 8,
                  height: 45,
                  paddingHorizontal: 12,
                  fontSize: 13,
                  marginBottom: 18,
                  backgroundColor: "#fbfcfd",
                  color: "#1e293b",
                }}
                placeholder="Ej: D8T"
                placeholderTextColor="#94a3b8"
              />

              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "800",
                  color: "#64748b",
                  marginBottom: 6,
                  textTransform: "uppercase",
                }}
              >
                SERIAL O CHASIS *
              </Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: "#cbd5e0",
                  borderRadius: 8,
                  height: 45,
                  paddingHorizontal: 12,
                  fontSize: 13,
                  marginBottom: 25,
                  backgroundColor: "#fbfcfd",
                  color: "#1e293b",
                }}
                placeholder="Escriba el serial único..."
                placeholderTextColor="#94a3b8"
              />

              <TouchableOpacity
                style={{
                  backgroundColor: "#0067b1",
                  height: 48,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 8,
                  shadowColor: "#0067b1",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 4,
                }}
              >
                <MaterialIcons name="save" size={20} color="#fff" />
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}
                >
                  Guardar Registro
                </Text>
              </TouchableOpacity>
            </ScrollView>
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
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#e2e8f0",
        marginBottom: 12,
        overflow: "hidden",
      }}
    >
      <TouchableOpacity
        onPress={() => setOpen(!open)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 14,
          backgroundColor: "#f8fafc",
        }}
        activeOpacity={0.7}
      >
        <Text
          style={{ flex: 1, fontSize: 14, fontWeight: "700", color: "#1e293b" }}
        >
          {title}
        </Text>
        <Text style={{ fontSize: 14, color: "#64748b" }}>
          {open ? "▲" : "▼"}
        </Text>
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
      <Text style={styles.detalleValor}>{valor || "—"}</Text>
    </View>
  );
}

// ─── PANTALLA DE MOVILIZACIONES ───────────────────────────────────────────────
function PantallaMovilizaciones({ user, onOpenMenu }) {
  const [activeView, setActiveView] = useState("historial");
  const [frentes, setFrentes] = useState([]);
  const [equiposBusq, setEquiposBusq] = useState([]);
  const [buscarEq, setBuscarEq] = useState("");
  const [equiposSel, setEquiposSel] = useState([]);
  const [frenteDest, setFrenteDest] = useState("");
  const [frenteDestNombre, setFrenteDestNombre] = useState("");
  const [detUbi, setDetUbi] = useState("");
  const [tipoMov, setTipoMov] = useState("despacho");
  const [guardando, setGuardando] = useState(false);
  const [pendientes, setPendientes] = useState([]);
  const [sincronizando, setSincronizando] = useState(false);

  // Historial locales
  const [historial, setHistorial] = useState([]);
  const [cargandoHist, setCargandoHist] = useState(true);
  const [searchHistorial, setSearchHistorial] = useState("");

  const cargarHistorial = useCallback(async () => {
    setCargandoHist(true);
    try {
      const cached = await AsyncStorage.getItem("movilizaciones_historial");
      if (cached) setHistorial(JSON.parse(cached));

      const data = await api("GET", "/movilizaciones");
      if (Array.isArray(data)) {
        setHistorial(data);
        await AsyncStorage.setItem(
          "movilizaciones_historial",
          JSON.stringify(data),
        );
      }
    } catch (e) {
      // Ignorar error silente de red en carga de historial (modo offline)
    } finally {
      setCargandoHist(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const f = await leerFrentesLocal();
      setFrentes(f);
      const p = await leerPendientes();
      setPendientes(p);
    })();
    cargarHistorial();
  }, [cargarHistorial]);

  const buscarEquipos = async (q) => {
    setBuscarEq(q);
    if (q.length < 2) {
      setEquiposBusq([]);
      return;
    }
    const data = await leerEquiposLocal(q);
    setEquiposBusq(data.slice(0, 10));
  };

  const toggleEquipo = (eq) => {
    setEquiposSel((prev) =>
      prev.find((e) => e.id_equipo === eq.id_equipo)
        ? prev.filter((e) => e.id_equipo !== eq.id_equipo)
        : [...prev, eq],
    );
  };

  const registrarMovimiento = async () => {
    if (equiposSel.length === 0) {
      showModernAlert("Atención", "Selecciona al menos un equipo.");
      return;
    }
    if (!frenteDest) {
      showModernAlert("Atención", "Selecciona el frente de destino.");
      return;
    }
    setGuardando(true);
    try {
      if (tipoMov === "despacho") {
        for (const eq of equiposSel) {
          await guardarMovPendiente({
            tipo: "despacho",
            id_equipo: eq.id_equipo,
            id_frente_dest: parseInt(frenteDest),
            detalle_ubi: detUbi,
          });
          const database = await getDb();
          await database.runAsync(
            "UPDATE equipos SET frente = ? WHERE id_equipo = ?",
            [frenteDestNombre, eq.id_equipo],
          );
        }
      } else {
        await guardarMovPendiente({
          tipo: "recepcion_directa",
          ids_equipos: equiposSel.map((e) => e.id_equipo).join(","),
          id_frente_dest: parseInt(frenteDest),
          detalle_ubi: detUbi,
        });
        const database = await getDb();
        for (const eq of equiposSel) {
          await database.runAsync(
            "UPDATE equipos SET frente = ? WHERE id_equipo = ?",
            [frenteDestNombre, eq.id_equipo],
          );
        }
      }
      const p = await leerPendientes();
      setPendientes(p);
      showModernAlert(
        "✅ Guardado",
        `${equiposSel.length} movimiento(s) guardado(s) en el teléfono.\n\nPresiona "Sincronizar" cuando tengas conexión.`,
      );
      setEquiposSel([]);
      setBuscarEq("");
      setEquiposBusq([]);
      setFrenteDest("");
      setFrenteDestNombre("");
      setDetUbi("");
      setActiveView("historial");
      setTimeout(cargarHistorial, 1000); // Recargar
    } catch (e) {
      showModernAlert("Error", "No se pudo guardar: " + e.message);
    } finally {
      setGuardando(false);
    }
  };

  const sincronizar = async () => {
    if (pendientes.length === 0) {
      showModernAlert(
        "Sin pendientes",
        "No hay movimientos pendientes de sincronizar.",
      );
      return;
    }
    setSincronizando(true);
    let exitosos = 0;
    let fallidos = 0;
    try {
      for (const p of pendientes) {
        try {
          if (p.tipo_mov === "despacho") {
            await api("POST", "/movilizaciones", {
              tipo: "despacho",
              ID_EQUIPO: p.id_equipo,
              ID_FRENTE_DESTINO: p.id_frente_dest,
            });
          } else {
            const ids = p.ids_equipos.split(",").map(Number).filter(Boolean);
            await api("POST", "/movilizaciones", {
              tipo: "recepcion_directa",
              ids,
              ID_FRENTE_DESTINO: p.id_frente_dest,
              DETALLE_UBICACION: p.detalle_ubi || "",
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
      if (exitosos > 0) cargarHistorial();
      showModernAlert(
        "🔄 Sincronización",
        `✅ ${exitosos} movimiento(s) enviados al servidor.\n${fallidos > 0 ? `⚠️ ${fallidos} fallaron (sin conexión).` : ""}`,
      );
    } catch (e) {
      showModernAlert("Error", "Error al sincronizar: " + e.message);
    } finally {
      setSincronizando(false);
    }
  };

  const historialesFiltrados = useMemo(() => {
    if (!searchHistorial.trim()) return historial;
    const q = searchHistorial.toLowerCase();
    return historial.filter(
      (h) =>
        (h.equipo?.CODIGO_PATIO?.toLowerCase() || "").includes(q) ||
        (h.equipo?.SERIAL_CHASIS?.toLowerCase() || "").includes(q) ||
        (h.CODIGO_CONTROL && String(h.CODIGO_CONTROL).includes(q)),
    );
  }, [historial, searchHistorial]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fdfbfb" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <TopHeader onOpenMenu={onOpenMenu} />

      <Text style={[styles.dashboardTitle, { marginBottom: 15 }]}>
        Registro de{"\n"}Movilizaciones
      </Text>

      {/* Selector de modo */}
      <View
        style={{
          flexDirection: "row",
          marginHorizontal: 16,
          marginBottom: 12,
          backgroundColor: "#e2e8f0",
          borderRadius: 10,
          padding: 4,
        }}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor:
              activeView === "historial" ? "#fff" : "transparent",
            borderRadius: 8,
            paddingVertical: 10,
            alignItems: "center",
            shadowColor: activeView === "historial" ? "#000" : "transparent",
            shadowOpacity: 0.1,
            shadowRadius: 2,
            shadowOffset: { width: 0, height: 1 },
          }}
          onPress={() => setActiveView("historial")}
        >
          <Text
            style={{
              fontWeight: activeView === "historial" ? "700" : "600",
              color: activeView === "historial" ? "#00004d" : "#64748b",
              fontSize: 13,
            }}
          >
            Historial
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: activeView === "nuevo" ? "#fff" : "transparent",
            borderRadius: 8,
            paddingVertical: 10,
            alignItems: "center",
            shadowColor: activeView === "nuevo" ? "#000" : "transparent",
            shadowOpacity: 0.1,
            shadowRadius: 2,
            shadowOffset: { width: 0, height: 1 },
          }}
          onPress={() => setActiveView("nuevo")}
        >
          <Text
            style={{
              fontWeight: activeView === "nuevo" ? "700" : "600",
              color: activeView === "nuevo" ? "#00004d" : "#64748b",
              fontSize: 13,
            }}
          >
            Nueva Recepción (+)
          </Text>
        </TouchableOpacity>
      </View>

      <View
        style={{
          paddingHorizontal: 16,
          paddingBottom: 6,
          flexDirection: "row",
          justifyContent: "flex-end",
        }}
      >
        {pendientes.length > 0 && (
          <TouchableOpacity
            style={[
              styles.btnSync,
              sincronizando && { opacity: 0.6 },
              {
                backgroundColor: "#f59e0b",
                paddingHorizontal: 15,
                paddingVertical: 10,
                borderRadius: 10,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
              },
            ]}
            onPress={sincronizar}
            disabled={sincronizando}
          >
            {sincronizando ? (
              <ActivityIndicator color={C.white} size="small" />
            ) : (
              <Text style={[styles.btnSyncText, { fontSize: 13 }]}>
                ⬆ Sincronizar ({pendientes.length})
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {activeView === "historial" ? (
          <View>
            {/* Barra de Filtros */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#fbfcfd",
                borderRadius: 12,
                paddingHorizontal: 15,
                height: 48,
                borderWidth: 1,
                borderColor: "#cbd5e0",
                marginBottom: 16,
              }}
            >
              <MaterialIcons name="search" size={20} color="#94a3b8" />
              <TextInput
                style={{
                  flex: 1,
                  marginLeft: 10,
                  fontSize: 13,
                  color: "#1e293b",
                }}
                placeholder="Buscar control, equipo, serial..."
                placeholderTextColor="#94a3b8"
                value={searchHistorial}
                onChangeText={setSearchHistorial}
              />
              {searchHistorial ? (
                <TouchableOpacity onPress={() => setSearchHistorial("")}>
                  <MaterialIcons name="close" size={18} color="#94a3b8" />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
              <View
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: "#cbd5e0",
                  borderRadius: 8,
                  height: 42,
                  paddingHorizontal: 12,
                  justifyContent: "center",
                  backgroundColor: "#fbfcfd",
                }}
              >
                <Text style={{ fontSize: 13, color: "#64748b" }}>
                  Filtro Tipo ▼
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: "#cbd5e0",
                  borderRadius: 8,
                  height: 42,
                  paddingHorizontal: 12,
                  justifyContent: "center",
                  backgroundColor: "#fbfcfd",
                }}
              >
                <Text style={{ fontSize: 13, color: "#64748b" }}>
                  Filtro Frente ▼
                </Text>
              </View>
            </View>

            {/* Indicador de carga */}
            {cargandoHist && historial.length === 0 ? (
              <ActivityIndicator
                size="large"
                color="#00004d"
                style={{ marginTop: 40 }}
              />
            ) : historialesFiltrados.length === 0 ? (
              <View
                style={{ alignItems: "center", marginTop: 40, opacity: 0.5 }}
              >
                <MaterialIcons name="inbox" size={48} color="#94a3b8" />
                <Text style={{ color: "#64748b", marginTop: 10 }}>
                  No hay movilizaciones.
                </Text>
              </View>
            ) : (
              <View>
                <Text
                  style={{
                    fontSize: 12,
                    color: "#64748b",
                    fontWeight: "700",
                    marginBottom: 12,
                    textTransform: "uppercase",
                  }}
                >
                  ULTIMOS REGISTROS
                </Text>
                {historialesFiltrados.map((h, i) => (
                  <View
                    key={h.ID_MOVILIZACION || i}
                    style={{
                      backgroundColor: "#fff",
                      borderRadius: 12,
                      padding: 15,
                      marginBottom: 15,
                      borderWidth: 1,
                      borderColor: "#e2e8f0",
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.05,
                      shadowRadius: 4,
                      elevation: 2,
                    }}
                  >
                    {/* Equipo Row */}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: 12,
                      }}
                    >
                      <View
                        style={{
                          width: 45,
                          height: 45,
                          borderRadius: 8,
                          backgroundColor: "#f1f5f9",
                          justifyContent: "center",
                          alignItems: "center",
                          marginRight: 12,
                          borderWidth: 1,
                          borderColor: "#f1f5f9",
                        }}
                      >
                        <MaterialIcons
                          name="local-shipping"
                          size={24}
                          color="#94a3b8"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 13,
                            color: "#718096",
                            fontWeight: "700",
                            textTransform: "uppercase",
                          }}
                        >
                          {h.equipo?.TIPO || "N/A"}
                        </Text>
                        <Text style={{ color: "#4a5568", fontSize: 13 }}>
                          <Text style={{ fontWeight: "700" }}>S: </Text>
                          {h.equipo?.SERIAL_CHASIS || "S/S"}
                        </Text>
                        <Text style={{ color: "#0ea5e9", fontSize: 13 }}>
                          <Text style={{ fontWeight: "700" }}>P: </Text>
                          {h.equipo?.PLACA || "S/P"}
                        </Text>
                        <Text
                          style={{
                            color: "#1e293b",
                            fontSize: 13,
                            fontWeight: "700",
                          }}
                        >
                          ID: {h.equipo?.CODIGO_PATIO || "N/D"}
                        </Text>
                      </View>
                      <View
                        style={{
                          alignItems: "flex-end",
                          justifyContent: "flex-start",
                        }}
                      >
                        {h.CODIGO_CONTROL ? (
                          <Text
                            style={{
                              fontWeight: "800",
                              color: "#1e293b",
                              fontSize: 13,
                            }}
                          >
                            MV-{String(h.CODIGO_CONTROL).padStart(5, "0")}
                          </Text>
                        ) : (
                          <View
                            style={{
                              backgroundColor: "#e0e7ff",
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                              borderRadius: 10,
                            }}
                          >
                            <Text
                              style={{
                                color: "#3730a3",
                                fontSize: 11,
                                fontWeight: "700",
                              }}
                            >
                              R.D.
                            </Text>
                          </View>
                        )}
                        <View style={{ marginTop: 6, alignItems: "center" }}>
                          {h.ESTADO_MVO === "TRANSITO" ? (
                            <Text
                              style={{
                                color: "#ef4444",
                                fontSize: 12,
                                fontWeight: "800",
                              }}
                            >
                              TRÁNSITO
                            </Text>
                          ) : (
                            <View
                              style={{
                                backgroundColor: "#dbeafe",
                                borderWidth: 1,
                                borderColor: "#93c5fd",
                                paddingHorizontal: 6,
                                paddingVertical: 4,
                                borderRadius: 6,
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <MaterialIcons
                                name="done-all"
                                size={12}
                                color="#1e40af"
                              />
                              <Text
                                style={{
                                  color: "#1e40af",
                                  fontSize: 9,
                                  fontWeight: "700",
                                }}
                              >
                                COMPLETADO
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>

                    {/* Trayecto Row */}
                    <View
                      style={{
                        backgroundColor: "#f8fafc",
                        borderRadius: 10,
                        padding: 12,
                        marginBottom: 12,
                        flexDirection: "row",
                        justifyContent: "center",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <View style={{ flex: 1, alignItems: "center" }}>
                        <Text
                          style={{
                            fontSize: 10,
                            color: "#64748b",
                            fontWeight: "800",
                            textTransform: "uppercase",
                            marginBottom: 2,
                          }}
                        >
                          Origen
                        </Text>
                        <Text
                          style={{
                            fontWeight: "600",
                            color: "#4a5568",
                            fontSize: 12,
                            textAlign: "center",
                          }}
                        >
                          {h.frente_origen?.NOMBRE_FRENTE || "Sin Origen"}
                        </Text>
                      </View>
                      <MaterialIcons name="east" size={18} color="#cbd5e0" />
                      <View style={{ flex: 1, alignItems: "center" }}>
                        <Text
                          style={{
                            fontSize: 10,
                            color: "#0067b1",
                            fontWeight: "800",
                            textTransform: "uppercase",
                            marginBottom: 2,
                          }}
                        >
                          Destino
                        </Text>
                        <Text
                          style={{
                            fontWeight: "700",
                            color: "#00004d",
                            fontSize: 12,
                            textAlign: "center",
                          }}
                        >
                          {h.frente_destino?.NOMBRE_FRENTE || "Sin Destino"}
                        </Text>
                      </View>
                    </View>

                    {/* RECEPCION DIRECTA */}
                    {h.TIPO_MOVIMIENTO === "RECEPCION_DIRECTA" && (
                      <View
                        style={{
                          alignItems: "center",
                          marginBottom: 12,
                          marginTop: -6,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: "#e0e7ff",
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 12,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <MaterialIcons
                            name="input"
                            size={12}
                            color="#3730a3"
                          />
                          <Text
                            style={{
                              color: "#3730a3",
                              fontSize: 10,
                              fontWeight: "700",
                            }}
                          >
                            RECEPCIÓN DIRECTA
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Fechas Row */}
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        borderTopWidth: 1,
                        borderTopColor: "#f1f5f9",
                        paddingTop: 10,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <MaterialIcons
                          name="logout"
                          size={14}
                          color="#ef4444"
                        />
                        <Text
                          style={{
                            fontSize: 12,
                            color: "#334155",
                            fontWeight: "600",
                          }}
                        >
                          {h.FECHA_DESPACHO
                            ? new Date(h.FECHA_DESPACHO).toLocaleDateString(
                                "es-VE",
                              )
                            : "--"}
                        </Text>
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <MaterialIcons name="login" size={14} color="#10b981" />
                        <Text
                          style={{
                            fontSize: 12,
                            color: "#334155",
                            fontWeight: "600",
                          }}
                        >
                          {h.FECHA_RECEPCION
                            ? new Date(h.FECHA_RECEPCION).toLocaleDateString(
                                "es-VE",
                              )
                            : "--"}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : (
          <View>
            <Text style={styles.sectionTitle}>Tipo de Movimiento</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {["despacho", "recepcion"].map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.tipoBtn,
                    tipoMov === t && styles.tipoBtnActive,
                  ]}
                  onPress={() => setTipoMov(t)}
                >
                  <Text
                    style={[
                      styles.tipoBtnText,
                      tipoMov === t && styles.tipoBtnActiveText,
                    ]}
                  >
                    {t === "despacho" ? "🚛 Despacho" : "📥 Recepción Directa"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>
              Buscar Equipo (código, placa, serie)
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: RET-001 o ABC-123"
              placeholderTextColor={C.textSec}
              value={buscarEq}
              onChangeText={buscarEquipos}
            />

            {equiposBusq.map((eq) => {
              const sel = equiposSel.find((e) => e.id_equipo === eq.id_equipo);
              return (
                <TouchableOpacity
                  key={eq.id_equipo}
                  style={[
                    styles.equipoBusqItem,
                    sel && styles.equipoBusqItemSel,
                  ]}
                  onPress={() => toggleEquipo(eq)}
                >
                  <Text
                    style={[styles.equipoBusqText, sel && { color: C.white }]}
                  >
                    {sel ? "✓ " : ""}
                    {eq.codigo_patio || eq.serial_chasis} · {eq.marca}{" "}
                    {eq.modelo}
                  </Text>
                  <Text
                    style={{ fontSize: 11, color: sel ? "#bfdbfe" : C.textSec }}
                  >
                    {eq.frente || "Sin Frente"}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {equiposSel.length > 0 && (
              <View style={styles.seleccionadosBox}>
                <Text style={styles.seleccionadosTitle}>
                  ✅ {equiposSel.length} equipo(s) seleccionado(s):
                </Text>
                {equiposSel.map((e) => (
                  <Text key={e.id_equipo} style={styles.seleccionadoItem}>
                    • {e.codigo_patio || e.serial_chasis}
                  </Text>
                ))}
              </View>
            )}

            <Text style={styles.label}>Frente de Destino</Text>
            {frentes.length === 0 ? (
              <Text
                style={{ color: C.textSec, fontSize: 13, marginBottom: 12 }}
              >
                ⚠️ No hay frentes guardados. Descarga los datos primero.
              </Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 12 }}
              >
                {frentes.map((f) => (
                  <TouchableOpacity
                    key={f.id_frente}
                    style={[
                      styles.frenteTag,
                      frenteDest === String(f.id_frente) &&
                        styles.frenteTagActive,
                    ]}
                    onPress={() => {
                      setFrenteDest(String(f.id_frente));
                      setFrenteDestNombre(f.nombre);
                    }}
                  >
                    <Text
                      style={[
                        styles.frenteTagText,
                        frenteDest === String(f.id_frente) && {
                          color: C.white,
                        },
                      ]}
                    >
                      {f.nombre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {tipoMov === "recepcion" && (
              <>
                <Text style={styles.label}>
                  Detalle de Ubicación (opcional)
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: Área de Mantenimiento"
                  placeholderTextColor={C.textSec}
                  value={detUbi}
                  onChangeText={setDetUbi}
                />
              </>
            )}

            <TouchableOpacity
              style={[
                styles.btnPrimary,
                { marginTop: 8 },
                guardando && { opacity: 0.6 },
              ]}
              onPress={registrarMovimiento}
              disabled={guardando}
            >
              {guardando ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <Text style={styles.btnPrimaryText}>
                  💾 GUARDAR EN TELÉFONO
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [menuVisible, setMenuVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [equiposCount, setEquiposCount] = useState(0);

  useEffect(() => {
    (async () => {
      await getDb(); // inicializar SQLite
      const savedUser = await AsyncStorage.getItem("user");
      const token = await AsyncStorage.getItem("token");
      if (savedUser && token) setUser(JSON.parse(savedUser));
      const eqs = await leerEquiposLocal();
      setEquiposCount(eqs.length);
      setLoading(false);
    })();
  }, [activeTab]);

  const handleLogout = () => {
    showModernAlert("Cerrar Sesión", "¿Estás seguro?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Salir",
        style: "destructive",
        onPress: async () => {
          try {
            await api("POST", "/logout");
          } catch (_) {}
          await AsyncStorage.removeItem("token");
          await AsyncStorage.removeItem("user");
          setUser(null);
          setActiveTab("dashboard");
        },
      },
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
        {activeTab === "dashboard" && (
          <PantallaDashboard
            onOpenMenu={() => setMenuVisible(true)}
            equiposCount={equiposCount}
          />
        )}
        {activeTab === "equipos" && (
          <PantallaEquipos
            user={user}
            onOpenMenu={() => setMenuVisible(true)}
          />
        )}
        {activeTab === "movs" && (
          <PantallaMovilizaciones
            user={user}
            onOpenMenu={() => setMenuVisible(true)}
          />
        )}
      </View>
    </View>
  );
}

// ─── ESTILOS ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bgLight },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  header: {
    backgroundColor: C.darkBg,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: { color: C.white, fontSize: 20, fontWeight: "bold" },
  headerSub: { color: "#94a3b8", fontSize: 12, marginTop: 2 },

  searchBar: { paddingHorizontal: 16, paddingVertical: 10 },
  searchInput: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 14,
    color: C.textPrim,
  },

  // Filter pills and dropdowns
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    gap: 4,
  },
  dropdownList: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginTop: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  dropdownItemText: {
    fontSize: 13,
    color: "#334155",
    fontWeight: "500",
  },

  // Serial text lines in equipment card (match web: "S: XXXX", "M: YYYY", "P: ZZZZ")
  serialLine: { fontSize: 13, color: "#4a5568", marginBottom: 1 },
  serialKey: { fontWeight: "700", color: "#4a5568" },

  // Premium UI Styles
  blueCurve: {
    position: "absolute",
    bottom: -Dimensions.get("window").height * 0.35,
    left: -Dimensions.get("window").width * 0.45,
    width: Dimensions.get("window").height,
    height: Dimensions.get("window").height,
    borderRadius: Dimensions.get("window").height / 2,
    backgroundColor: "#00004d",
  },
  blueCurveDashboard: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: -Dimensions.get("window").width * 0.25,
    width: Dimensions.get("window").width * 0.65,
    backgroundColor: "#00004d",
    borderTopRightRadius: Dimensions.get("window").height * 0.4,
    borderBottomRightRadius: Dimensions.get("window").height * 0.4,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginBottom: 2,
    borderRadius: 10,
    gap: 4,
  },
  menuItemText: {
    fontSize: 15,
    color: "#334155",
    fontWeight: "600",
  },
  loginCardPremium: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 30,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    marginHorizontal: 10,
  },
  inputContainerPremium: {
    borderWidth: 1,
    borderColor: "#cbd5e0",
    borderRadius: 10,
    marginBottom: 20,
    position: "relative",
    backgroundColor: "#fff",
  },
  floatingLabel: {
    position: "absolute",
    top: -9,
    left: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 5,
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
  },
  inputPremium: {
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 15,
    color: "#1e293b",
  },
  btnPremium: {
    backgroundColor: "#00004d",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 10,
  },
  btnPremiumText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  topHeaderPremium: {
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight + 10 : 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  dashboardTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#000000",
    textAlign: "center",
    marginTop: 25,
    marginBottom: 20,
    lineHeight: 28,
  },
  dashboardWidgetGroup: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  widgetPremium: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 15,
  },
  widgetIconBox: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 10, fontWeight: "bold" },

  equipoCard: {
    backgroundColor: C.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
  },
  equipoCodigo: { fontSize: 15, fontWeight: "bold", color: C.textPrim },
  equipoTipo: { fontSize: 12, color: C.textSec, marginTop: 2 },
  equipoFrente: { fontSize: 12, color: C.blue, marginTop: 4 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: C.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "90%",
  },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: C.textPrim },
  modalSection: {
    fontSize: 12,
    fontWeight: "700",
    color: C.blue,
    marginTop: 14,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detalleRow: {
    flexDirection: "row",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: C.bgLight,
  },
  detalleLabel: {
    width: 110,
    fontSize: 13,
    color: C.textSec,
    fontWeight: "600",
  },
  detalleValor: { flex: 1, fontSize: 13, color: C.textPrim },

  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: C.textPrim,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tipoBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
  },
  tipoBtnActive: { backgroundColor: C.blue, borderColor: C.blue },
  tipoBtnText: { fontSize: 12, color: C.textSec, fontWeight: "600" },
  tipoBtnActiveText: { color: C.white },

  equipoBusqItem: {
    backgroundColor: C.bgLight,
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  equipoBusqItemSel: { backgroundColor: C.blue, borderColor: C.blue },
  equipoBusqText: { fontSize: 13, fontWeight: "600", color: C.textPrim },

  seleccionadosBox: {
    backgroundColor: "#f0fdf4",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  seleccionadosTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: C.green,
    marginBottom: 4,
  },
  seleccionadoItem: { fontSize: 12, color: C.textPrim, marginTop: 2 },

  frenteTag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bgLight,
    marginRight: 8,
  },
  frenteTagActive: { backgroundColor: C.blue, borderColor: C.blue },
  frenteTagText: { fontSize: 12, fontWeight: "600", color: C.textSec },

  pendienteItem: {
    backgroundColor: "#fffbeb",
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: C.orange,
  },
  pendienteText: { fontSize: 12, color: C.textPrim },

  tabBar: {
    flexDirection: "row",
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingBottom: Platform.OS === "ios" ? 20 : 8,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: "center" },
  tabIcon: { fontSize: 22 },
  tabLabel: { fontSize: 11, color: C.textSec, marginTop: 2, fontWeight: "600" },
  tabActive: { color: C.blue },

  // PantallaLogin utilities
  loadingText: { fontSize: 14, color: C.textSec, marginTop: 12 },
  emptyText: { fontSize: 14, color: C.textSec, textAlign: "center" },
  btnDownload: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnDownloadText: { color: C.white, fontWeight: "700", fontSize: 14 },

  // PantallaMovilizaciones utilities
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: C.textPrim,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: C.textPrim,
    backgroundColor: C.white,
    marginBottom: 12,
  },
  btnPrimary: {
    backgroundColor: "#00004d",
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
  },
  btnPrimaryText: { color: C.white, fontWeight: "800", fontSize: 15 },
  btnSync: {
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 10,
    alignItems: "center",
  },
  btnSyncText: { color: C.white, fontWeight: "700", fontSize: 13 },

  // Configurar IP en login
  ipBox: {
    backgroundColor: "rgba(0,0,77,0.6)",
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    width: "100%",
  },
  ipInput: {
    borderWidth: 1,
    borderColor: "#6ee7b7",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
    marginBottom: 10,
  },
  btnSaveIp: {
    backgroundColor: "#10b981",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  btnSaveIpText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
