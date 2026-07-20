// ═══════════════════════════════════════════════
// INVENTARY ARB
// ═══════════════════════════════════════════════
const DB = {
    cargar() {
        this.productos = JSON.parse(localStorage.getItem("productos")) || [];
        this.movimientos = JSON.parse(localStorage.getItem("movimientos")) || [];
        this.gastos = JSON.parse(localStorage.getItem("gastos")) || [];
        this.clientes = JSON.parse(localStorage.getItem("clientes")) || [];
        this.proveedores = JSON.parse(localStorage.getItem("proveedores")) || [];
        this.almacenes = JSON.parse(localStorage.getItem("almacenes")) || [
            { id: "alm1", nombre: "Almacén principal" },
            { id: "alm2", nombre: "Tienda" }
        ];
        this.configuracion = JSON.parse(localStorage.getItem("configuracion")) || {
            nombreNegocio: "Mi Negocio", emoji: "🏪", propietario: "",
            telefono: "", direccion: "", municipio: "", provincia: "",
            regimenFiscal: "TCP", numONAT: "", actividad: "", piePagina: "",
            moneda: "CUP", stockMinimo: 5, alertasStock: true, vistaLista: false,
            mostrarAgotados: true, alertaVencimiento: true, agruparCategoria: false,
            metodoPagoDefault: "efectivo", ventasSinStock: false, solicitarCliente: false,
            numAuto: true, proxFactura: 1,
            impuestoAuto: false, porcentajeImpuesto: 10,
            notifStockBajo: true, notifAlSalida: true, notifVencimiento: true, diasVencimiento: 7,
            pinActivo: false, pin: "", bloqueoAuto: 0, ocultarCompra: false,
            ultimoRespaldo: "",
            tamanoTexto: "normal", animaciones: true, glow: true,
            formatoFecha: "dd/mm/yyyy", separadorDecimal: "punto"
        };
        this.productos = this.productos.map((p, i) => ({
            ...p, id: p.id || "prod_" + Date.now() + "_" + i
        }));
        this.almacenes = this.almacenes.map((a, i) => ({
            id: a.id || "alm_" + Date.now() + "_" + i,
            nombre: a.nombre || "Almacén",
            emoji: a.emoji || "🏪",
            responsable: a.responsable || "",
            direccion: a.direccion || "",
            permiteVentas: a.permiteVentas !== false,
            permiteTransferencias: a.permiteTransferencias !== false,
            activo: a.activo !== false
        }));
        this.guardar();
    },

    guardar() {
        localStorage.setItem("productos", JSON.stringify(this.productos));
        localStorage.setItem("movimientos", JSON.stringify(this.movimientos));
        localStorage.setItem("gastos", JSON.stringify(this.gastos));
        localStorage.setItem("clientes", JSON.stringify(this.clientes));
        localStorage.setItem("proveedores", JSON.stringify(this.proveedores));
        localStorage.setItem("almacenes", JSON.stringify(this.almacenes));
        localStorage.setItem("configuracion", JSON.stringify(this.configuracion));
    },

    agregarProducto(producto) {
        producto.id = "prod_" + Date.now();
        producto.fechaCreacion = new Date().toISOString();
        this.productos.push(producto);
        this.guardar();
        return producto;
    },

    actualizarProducto(id, datos) {
        const idx = this.productos.findIndex(p => p.id === id);
        if (idx !== -1) { this.productos[idx] = { ...this.productos[idx], ...datos }; this.guardar(); }
    },

    eliminarProducto(id) { this.productos = this.productos.filter(p => p.id !== id); this.guardar(); },
    buscarProducto(id) { return this.productos.find(p => p.id === id); },
    buscarPorCodigo(codigo) { return this.productos.find(p => p.codigoBarras === codigo); },

    registrarMovimiento(tipo, productoId, datos) {
        const mov = { id: "mov_" + Date.now(), tipo, productoId, fecha: new Date().toISOString(), ...datos };
        this.movimientos.push(mov);
        this.guardar();
        return mov;
    },

    movimientosRecientes(limite = 200) {
        return [...this.movimientos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, limite);
    },

    estadisticas() {
        let capital = 0, valorVenta = 0, stockBajo = 0;
        this.productos.forEach(p => {
            capital += (p.compra || 0) * (p.cantidad || 0);
            valorVenta += (p.venta || 0) * (p.cantidad || 0);
            if (p.cantidad <= p.stockMinimo) stockBajo++;
        });
        const ganancia = valorVenta - capital;
        const margen = capital > 0 ? Math.round((ganancia / capital) * 100) : 0;
        const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0,0,0,0);
        const movMes = this.movimientos.filter(m => new Date(m.fecha) >= inicioMes);
        return {
            capital, valorVenta, ganancia, margen, stockBajo,
            entradasMes: movMes.filter(m => m.tipo === "entrada").length,
            salidasMes: movMes.filter(m => m.tipo === "salida").length
        };
    },

    // ── FIFO: gestión de lotes ──
    // Recalcula cantidad (suma de lotes) y compra (costo del lote más viejo) a partir de p.lotes
    sincronizarLotes(producto) {
        if (!producto.lotes || producto.lotes.length === 0) return;
        producto.lotes = producto.lotes.filter(l => l.cantidad > 0);
        producto.cantidad = producto.lotes.reduce((sum, l) => sum + l.cantidad, 0);
        producto.compra = producto.lotes.length > 0 ? producto.lotes[0].costo : 0;
    },

    // Agrega un nuevo lote (entrada de mercancía) a un producto con sistema FIFO activo
    agregarLote(productoId, cantidad, costo) {
        const p = this.buscarProducto(productoId);
        if (!p || !p.usaFifo) return;
        if (!p.lotes) p.lotes = [];
        p.lotes.push({ id: "lote_" + Date.now(), cantidad, costo, fecha: new Date().toISOString() });
        this.sincronizarLotes(p);
        this.guardar();
    },

    // Consume cantidad del lote más viejo hacia el más nuevo (FIFO). Devuelve el costo real total consumido.
    consumirLotesFIFO(productoId, cantidadAConsumir) {
        const p = this.buscarProducto(productoId);
        if (!p || !p.usaFifo || !p.lotes) return { costoTotal: 0, detalle: [] };
        let restante = cantidadAConsumir;
        let costoTotal = 0;
        const detalle = [];
        for (const lote of p.lotes) {
            if (restante <= 0) break;
            const tomar = Math.min(lote.cantidad, restante);
            lote.cantidad -= tomar;
            costoTotal += tomar * lote.costo;
            restante -= tomar;
            detalle.push({ cantidad: tomar, costo: lote.costo });
        }
        this.sincronizarLotes(p);
        this.guardar();
        return { costoTotal, detalle, costoUnitarioPromedio: cantidadAConsumir > 0 ? costoTotal / cantidadAConsumir : 0 };
    },

    // Devuelve cantidad al lote más viejo (usado al editar/revertir un movimiento)
    devolverALoteMasViejo(productoId, cantidad, costo) {
        const p = this.buscarProducto(productoId);
        if (!p || !p.usaFifo) return;
        if (!p.lotes) p.lotes = [];
        p.lotes.unshift({ id: "lote_" + Date.now(), cantidad, costo, fecha: new Date().toISOString() });
        this.sincronizarLotes(p);
        this.guardar();
    },

    // ── GASTOS ──
    agregarGasto(gasto) {
        gasto.id = "gasto_" + Date.now();
        gasto.fechaCreacion = new Date().toISOString();
        this.gastos.push(gasto);
        this.guardar();
        return gasto;
    },

    actualizarGasto(id, datos) {
        const idx = this.gastos.findIndex(g => g.id === id);
        if (idx !== -1) { this.gastos[idx] = { ...this.gastos[idx], ...datos }; this.guardar(); }
    },

    eliminarGasto(id) {
        this.gastos = this.gastos.filter(g => g.id !== id);
        this.guardar();
    },

    buscarGasto(id) { return this.gastos.find(g => g.id === id); },

    gastosEnRango(inicio, fin) {
        return this.gastos.filter(g => {
            const f = new Date(g.fecha);
            return f >= inicio && f <= fin;
        });
    },

    // ── CLIENTES ──
    agregarCliente(datos) {
        const cliente = { ...datos, id: "cli_" + Date.now(), fechaCreacion: new Date().toISOString(), abonos: [] };
        this.clientes.push(cliente);
        this.guardar();
        return cliente;
    },

    actualizarCliente(id, datos) {
        const idx = this.clientes.findIndex(c => c.id === id);
        if (idx !== -1) { this.clientes[idx] = { ...this.clientes[idx], ...datos }; this.guardar(); }
    },

    eliminarCliente(id) {
        this.clientes = this.clientes.filter(c => c.id !== id);
        this.guardar();
    },

    buscarCliente(id) { return this.clientes.find(c => c.id === id); },

    agregarProveedor(datos) {
        const p = { ...datos, id: "prov_" + Date.now(), fechaCreacion: new Date().toISOString() };
        this.proveedores.push(p); this.guardar(); return p;
    },
    actualizarProveedor(id, datos) {
        const idx = this.proveedores.findIndex(p => p.id === id);
        if (idx !== -1) { this.proveedores[idx] = { ...this.proveedores[idx], ...datos }; this.guardar(); }
    },
    eliminarProveedor(id) { this.proveedores = this.proveedores.filter(p => p.id !== id); this.guardar(); },
    buscarProveedor(id) { return this.proveedores.find(p => p.id === id); },
    comprasProveedor(nombre) { return this.movimientos.filter(m => m.tipo === "entrada" && m.proveedor === nombre); },
    totalCompradoProveedor(nombre, inicio, fin) {
        return this.comprasProveedor(nombre)
            .filter(m => { const f = new Date(m.fecha); return f >= inicio && f <= fin; })
            .reduce((s, m) => s + (m.precioUnitario||0)*(m.cantidad||0), 0);
    },

    // Calcula saldo pendiente (fiados no saldados - abonos)
    saldoCliente(id) {
        const fiados = this.movimientos.filter(m => m.clienteId === id && m.tipo === "salida" && m.metodoPago === "fiado" && !m.saldado);
        const totalFiado = fiados.reduce((sum, m) => sum + ((m.precioUnitario || 0) * (m.cantidad || 0)), 0);
        const cli = this.buscarCliente(id);
        const totalAbonos = (cli && cli.abonos) ? cli.abonos.reduce((sum, a) => sum + (a.monto || 0), 0) : 0;
        return Math.max(0, totalFiado - totalAbonos);
    },

    // Fiados vencidos (fecha de vencimiento pasada y no saldados)
    fiadosVencidos(id) {
        const hoy = new Date();
        return this.movimientos.filter(m =>
            m.clienteId === id && m.tipo === "salida" && m.metodoPago === "fiado" &&
            !m.saldado && m.fechaVencimiento && new Date(m.fechaVencimiento) < hoy
        );
    },

    // Nivel de riesgo automático
    nivelRiesgo(id) {
        const saldo = this.saldoCliente(id);
        if (saldo === 0) return "verde";
        const vencidos = this.fiadosVencidos(id);
        if (vencidos.length > 0) return "rojo";
        const fiados = this.movimientos.filter(m => m.clienteId === id && m.tipo === "salida" && m.metodoPago === "fiado" && !m.saldado);
        const masAntiguo = fiados.reduce((min, m) => new Date(m.fecha) < new Date(min.fecha) ? m : min, fiados[0]);
        const diasDeuda = masAntiguo ? (new Date() - new Date(masAntiguo.fecha)) / (1000 * 60 * 60 * 24) : 0;
        return diasDeuda > 30 ? "rojo" : diasDeuda > 7 ? "amarillo" : "verde";
    }
};

// ═══════════════════════════════════════════════
// ESTADO
// ═══════════════════════════════════════════════
let editandoId = null;
let vistaActual = "tarjeta";
let soloStockBajo = false;
let agruparPorCategoria = false;
let tipoMovActual = "entrada";
let productoMovSeleccionado = null;
let ajustandoId = null;
let editandoMovId = null;
let escaner = null;
let campoDestino = null;
let sheetFiltroActivo = "";
let sheetModo = "movimiento";
let productoAccionId = null;
let pinIngresado = "";
let subConfigActual = null;
let almacenActualId = null;
let tabAlmacenActual = "productos";
let editandoAlmacenId = null;
let escalasTemp = [];
let editandoGastoId = null;
let periodoDashFin = "mes";
let clienteActualId = null;
let editandoClienteId = null;
let tabClienteActual = "fiados";
let vistaReporteActual = "dia";
let onatTabActual = "panel";
let posCarritoItems = []; // [{producto, cantidad, precioUnitario, descuento}]
let posMetodoActual = "efectivo";
let proveedorActualId = null;
let editandoProveedorId = null;
let tabProveedorActual = "estadisticas";

const CATEGORIAS_GASTO = {
    combustible: { nombre: "Combustible", icono: "⛽" },
    transporte: { nombre: "Transporte", icono: "🚚" },
    electricidad: { nombre: "Electricidad", icono: "⚡" },
    salarios: { nombre: "Salarios", icono: "👷" },
    onat: { nombre: "ONAT", icono: "🏛️" },
    mantenimiento: { nombre: "Mantenimiento", icono: "🛠️" },
    insumos: { nombre: "Insumos", icono: "📦" },
    internet: { nombre: "Internet y teléfono", icono: "📱" },
    otros: { nombre: "Otros", icono: "🧾" }
};

const ICONOS = {
    "Alimentos":"🍎","Bebidas":"🧃","Limpieza":"🧴",
    "Higiene personal":"🪥","Ropa y calzado":"👟",
    "Electrónica":"📱","Ferretería":"🔧","Medicamentos":"💊",
    "Materia prima":"📦","Otro":"🏷️"
};

const EMOJIS_NEGOCIO = ["🏪","🏬","🛒","🍽️","💈","🧴","👗","🔧","💊","🍞",
    "🥩","🧃","🍺","📦","🏭","🌿","🐄","🐟","👟","🎮",
    "🎯","🏋️","🌸","🧁","🍕","🔑","💻","📱","🎸","🌾"];

DB.cargar();

// Aplicar configuraciones al iniciar
aplicarConfiguracion();

// Verificar PIN al iniciar
if (DB.configuracion.pinActivo && DB.configuracion.pin) {
    mostrarModalPin();
} else {
    actualizarInicio();
    verificarStockAlIniciar();
}

// ═══════════════════════════════════════════════
// APLICAR CONFIGURACIÓN GLOBAL
// ═══════════════════════════════════════════════
function aplicarConfiguracion() {
    const cfg = DB.configuracion;
    // Tamaño de texto
    const sizes = { "normal": "16px", "grande": "18px", "muy-grande": "20px" };
    document.documentElement.style.fontSize = sizes[cfg.tamanoTexto] || "16px";
    // Animaciones
    if (!cfg.animaciones) {
        const style = document.createElement("style");
        style.id = "no-anim";
        style.innerText = "* { animation: none !important; transition: none !important; }";
        if (!document.getElementById("no-anim")) document.head.appendChild(style);
    }
    // Glow
    document.querySelectorAll(".bg-glow").forEach(el => {
        el.style.display = cfg.glow !== false ? "" : "none";
    });
}

// ═══════════════════════════════════════════════
// NAVEGACIÓN
// ═══════════════════════════════════════════════
function mostrarPantalla(id, direccion = "adelante") {
    document.querySelectorAll(".pantalla").forEach(p => p.classList.remove("activa", "slide-adelante", "slide-atras"));
    const pantalla = document.getElementById(id);
    pantalla.classList.add("activa");
    pantalla.classList.add(direccion === "atras" ? "slide-atras" : "slide-adelante");
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
}

function volverInicio() {
    mostrarPantalla("pantallaInicio", "atras");
    document.querySelectorAll(".nav-item")[0].classList.add("active");
    actualizarInicio();
    document.getElementById("btnFlotante").classList.remove("ocultar-boton");
}

function abrirInventario() {
    mostrarPantalla("pantallaInventario");
    document.querySelectorAll(".nav-item")[1].classList.add("active");
    if (DB.configuracion.vistaLista && vistaActual === "tarjeta") {
        vistaActual = "lista";
        document.getElementById("btnVistaTarjeta").classList.remove("activo");
        document.getElementById("btnVistaLista").classList.add("activo");
    }
    mostrarInventario();
    document.getElementById("btnFlotante").classList.remove("ocultar-boton");
}

function abrirMovimientos() {
    mostrarPantalla("pantallaMovimientos");
    document.querySelectorAll(".nav-item")[2].classList.add("active");
    cambiarTab("entrada");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
}

function abrirHistorial() {
    mostrarPantalla("pantallaHistorial");
    document.querySelectorAll(".nav-item")[3].classList.add("active");
    mostrarHistorial();
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
}

function abrirAlmacenes() {
    mostrarPantalla("pantallaAlmacenes");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    mostrarAlmacenes();
}

function volverAlmacenes() {
    mostrarPantalla("pantallaAlmacenes", "atras");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    mostrarAlmacenes();
}

function abrirGastos() {
    mostrarPantalla("pantallaGastos");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    mostrarGastos();
    verificarRecurrentesPendientes();
}

function abrirClientes() {
    mostrarPantalla("pantallaClientes");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    mostrarClientes();
}

function abrirReportes() {
    mostrarPantalla("pantallaReportes");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    vistaReporteActual = "dia";
    actualizarReporte();
}

function abrirBusquedaGlobal() {
    mostrarPantalla("pantallaBusquedaGlobal");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    document.getElementById("inputBusquedaGlobal").value = "";
    document.getElementById("resultadosBusquedaGlobal").innerHTML = `<p style="text-align:center;color:var(--text2);padding:40px 0;">Escribe para buscar en toda la app...</p>`;
    setTimeout(() => document.getElementById("inputBusquedaGlobal").focus(), 300);
}

function ejecutarBusquedaGlobal() {
    const texto = document.getElementById("inputBusquedaGlobal").value.trim().toLowerCase();
    const el = document.getElementById("resultadosBusquedaGlobal");
    if (texto.length < 2) { el.innerHTML = `<p style="text-align:center;color:var(--text2);padding:40px 0;">Escribe al menos 2 caracteres...</p>`; return; }
    const moneda = DB.configuracion.moneda || "CUP";
    let html = "";

    // Productos
    const prods = DB.productos.filter(p => p.nombre.toLowerCase().includes(texto) || (p.categoria||"").toLowerCase().includes(texto));
    if (prods.length > 0) {
        html += `<div class="cfg-grupo-label">📦 Productos (${prods.length})</div>`;
        html += prods.slice(0,5).map(p => `
            <div class="gas-card" onclick="abrirInventario()" style="margin-bottom:6px;">
                <div class="gas-card-icono">${ICONOS[p.categoria]||"📦"}</div>
                <div class="gas-card-info"><h4>${p.nombre}</h4><p>${p.cantidad} ${p.unidad||""} · ${p.almacen||"—"}</p></div>
                <div class="gas-card-monto" style="color:var(--accent);">${(p.venta||0).toLocaleString("es-CU")} ${moneda}</div>
            </div>`).join("");
    }

    // Clientes
    const clis = DB.clientes.filter(c => c.nombre.toLowerCase().includes(texto) || (c.telefono||"").includes(texto));
    if (clis.length > 0) {
        html += `<div class="cfg-grupo-label">👥 Clientes (${clis.length})</div>`;
        html += clis.slice(0,3).map(c => {
            const saldo = DB.saldoCliente(c.id);
            return `<div class="gas-card" onclick="abrirPerfilCliente('${c.id}')" style="margin-bottom:6px;">
                <div class="gas-card-icono" style="background:rgba(245,197,66,0.1);">👤</div>
                <div class="gas-card-info"><h4>${c.nombre}</h4><p>${c.telefono||"Sin teléfono"}</p></div>
                <div class="gas-card-monto">${saldo > 0 ? saldo.toLocaleString("es-CU")+" "+moneda : "Al día"}</div>
            </div>`;
        }).join("");
    }

    // Proveedores
    const provs = DB.proveedores.filter(p => p.nombre.toLowerCase().includes(texto) || (p.contacto||"").toLowerCase().includes(texto));
    if (provs.length > 0) {
        html += `<div class="cfg-grupo-label">🤝 Proveedores (${provs.length})</div>`;
        html += provs.slice(0,3).map(p => `
            <div class="gas-card" onclick="abrirPerfilProveedor('${p.id}')" style="margin-bottom:6px;">
                <div class="gas-card-icono" style="background:rgba(0,188,188,0.1);">🤝</div>
                <div class="gas-card-info"><h4>${p.nombre}</h4><p>${p.contacto||p.municipio||"—"}</p></div>
                <span style="color:var(--text3);font-size:20px;">›</span>
            </div>`).join("");
    }

    // Gastos
    const gastos = DB.gastos.filter(g => g.concepto.toLowerCase().includes(texto));
    if (gastos.length > 0) {
        html += `<div class="cfg-grupo-label">🧾 Gastos (${gastos.length})</div>`;
        html += gastos.slice(0,3).map(g => {
            const cat = CATEGORIAS_GASTO[g.categoria]||{icono:"🧾"};
            return `<div class="gas-card" onclick="abrirGastos()" style="margin-bottom:6px;">
                <div class="gas-card-icono" style="background:rgba(255,107,74,0.1);">${cat.icono}</div>
                <div class="gas-card-info"><h4>${g.concepto}</h4><p>${new Date(g.fecha).toLocaleDateString("es-CU")}</p></div>
                <div class="gas-card-monto">${(g.monto||0).toLocaleString("es-CU")} ${moneda}</div>
            </div>`;
        }).join("");
    }

    // Movimientos
    const movs = DB.movimientos.filter(m => {
        const p = DB.buscarProducto(m.productoId);
        return (p && p.nombre.toLowerCase().includes(texto)) || (m.nota||"").toLowerCase().includes(texto) || (m.cliente||"").toLowerCase().includes(texto);
    });
    if (movs.length > 0) {
        html += `<div class="cfg-grupo-label">📋 Movimientos (${movs.length})</div>`;
        html += movs.slice(0,3).map(m => {
            const p = DB.buscarProducto(m.productoId);
            return `<div class="gas-card" onclick="abrirHistorial()" style="margin-bottom:6px;">
                <div class="gas-card-icono">${m.tipo==="entrada"?"📥":"📤"}</div>
                <div class="gas-card-info"><h4>${p?p.nombre:"Producto"}</h4><p>${new Date(m.fecha).toLocaleDateString("es-CU")} · ${m.tipo}</p></div>
                <div class="gas-card-monto" style="color:${m.tipo==="entrada"?"var(--accent)":"var(--warn)"};">${m.tipo==="entrada"?"+":"-"}${m.cantidad} uds</div>
            </div>`;
        }).join("");
    }

    if (!html) html = `<p style="text-align:center;color:var(--text2);padding:40px 0;">Sin resultados para "${texto}"</p>`;
    el.innerHTML = html;
}

function abrirCajaPOS() {
    mostrarPantalla("pantallaCajaPOS");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    posCarritoItems = [];
    document.getElementById("posDescGlobal").value = "";
    document.getElementById("posEfectivoRecibido").value = "";
    document.getElementById("posClienteId").value = "";
    document.getElementById("textoClientePOS").className = "texto-prod-placeholder";
    document.getElementById("textoClientePOS").innerText = "Toca para seleccionar cliente...";
    document.getElementById("posMixtoEfectivo").value = "";
    document.getElementById("posMixtoTransferencia").value = "";
    document.getElementById("posMixtoRestante").innerText = "";
    const botonesEl = document.getElementById("posMontosBotones");
    if (botonesEl) botonesEl.innerHTML = "";
    // Restaurar último método de pago
    const metodoDef = DB.configuracion.metodoPagoDefault || "efectivo";
    const btnMetodo = document.querySelector(`.pos-metodo[data-metodo="${metodoDef}"]`);
    if (btnMetodo) seleccionarMetodoPOS(btnMetodo);
    else seleccionarMetodoPOS(document.querySelector('.pos-metodo[data-metodo="efectivo"]'));
    renderCarrito(); // Inicializa estado vacío correctamente
}

function volverCajaPOS() {
    mostrarPantalla("pantallaCajaPOS", "atras");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
}

function abrirCierreCaja() {
    mostrarPantalla("pantallaCierreCaja");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    renderCierreCaja();
}

function abrirProveedores() {
    mostrarPantalla("pantallaProveedores");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    mostrarProveedores();
}
function volverProveedores() {
    mostrarPantalla("pantallaProveedores", "atras");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    mostrarProveedores();
}
function abrirPerfilProveedor(id) {
    proveedorActualId = id;
    mostrarPantalla("pantallaPerfilProveedor");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    actualizarPerfilProveedor();
}

function abrirONAT() {
    mostrarPantalla("pantallaONAT");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    onatTabActual = "panel";
    // Set current month in selector
    const ahora = new Date();
    const selMes = document.getElementById("onatMesTributo");
    const selAnio = document.getElementById("onatAnioTributo");
    if (selMes) selMes.value = ahora.getMonth();
    if (selAnio) selAnio.value = ahora.getFullYear();
    renderONATPanel();
}

function volverONAT() {
    mostrarPantalla("pantallaONAT", "atras");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
}

function abrirONATTab(tab) {
    onatTabActual = tab;
    ["panel","tributos","calendario","expediente"].forEach(t => {
        document.getElementById("onatTab" + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle("activo", t === tab);
        document.getElementById("onatContenido" + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle("oculto", t !== tab);
    });
    if (tab === "panel") renderONATPanel();
    else if (tab === "tributos") renderTributos();
    else if (tab === "calendario") renderCalendarioFiscal();
    else if (tab === "expediente") cargarExpediente();
}

function abrirSimulador() {
    mostrarPantalla("pantallaSimulador");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    calcularSimulacion();
}

function volverClientes() {
    mostrarPantalla("pantallaClientes", "atras");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    mostrarClientes();
}

function abrirPerfilCliente(id) {
    clienteActualId = id;
    mostrarPantalla("pantallaPerfilCliente");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    actualizarPerfilCliente();
}

function volverGastos() {
    mostrarPantalla("pantallaGastos", "atras");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    mostrarGastos();
}

function abrirConfiguracion() {
    mostrarPantalla("pantallaConfiguracion");
    document.querySelectorAll(".nav-item")[4].classList.add("active");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    actualizarTarjetaNegocio();
}

function abrirSubConfig(sub) {
    subConfigActual = sub;
    const mapa = {
        negocio: "subNegocio", inventario: "subInventario", ventas: "subVentas",
        onat: "subOnat", notificaciones: "subNotificaciones", seguridad: "subSeguridad",
        respaldo: "subRespaldo", exportar: "subExportar", apariencia: "subApariencia",
        idioma: "subIdioma", pro: "subPro", acerca: "subAcerca"
    };
    const pantallaId = mapa[sub];
    if (!pantallaId) return;
    mostrarPantalla(pantallaId, "adelante");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    cargarSubConfig(sub);
}

function volverConfig() {
    mostrarPantalla("pantallaConfiguracion", "atras");
    document.querySelectorAll(".nav-item")[4].classList.add("active");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    actualizarTarjetaNegocio();
}

function proximamente(nombre) {
    alert(`🚧 "${nombre}" próximamente.`);
}

// ═══════════════════════════════════════════════
// ESCÁNER
// ═══════════════════════════════════════════════
function abrirEscaner(campo) {
    campoDestino = campo;
    document.getElementById("modalEscaner").classList.remove("oculto");
    escaner = new Html5Qrcode("visorEscaner");
    escaner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (codigo) => {
            if (campoDestino === "movCodigoBarras") {
                document.getElementById(campoDestino).value = codigo;
                buscarPorCodigoMov();
            } else {
                document.getElementById(campoDestino).value = codigo;
                const existe = DB.buscarPorCodigo(codigo);
                if (existe && campoDestino === "codigoBarras") alert(`⚠️ Código ya asignado a: ${existe.nombre}`);
            }
            cerrarEscaner();
        }, () => {}
    ).catch(() => { alert("⚠️ No se pudo acceder a la cámara."); cerrarEscaner(); });
}

function cerrarEscaner() {
    if (escaner) { escaner.stop().catch(() => {}); escaner = null; }
    document.getElementById("modalEscaner").classList.add("oculto");
}

// ═══════════════════════════════════════════════
// INICIO
// ═══════════════════════════════════════════════
function actualizarInicio() {
    const est = DB.estadisticas();
    const cfg = DB.configuracion;
    const moneda = cfg.moneda || "CUP";

    // Hero card (se mantiene)
    document.getElementById("heroCapital").innerText = est.capital.toLocaleString("es-CU");
    document.getElementById("heroVenta").innerText = est.valorVenta.toLocaleString("es-CU");
    document.getElementById("heroTotal").innerText = DB.productos.length;
    document.getElementById("heroMargen").innerText = est.margen;
    document.getElementById("statProductos").innerText = DB.productos.length;
    document.getElementById("statAlmacenes").innerText = DB.almacenes.length;
    document.getElementById("statStock").innerText = est.stockBajo;
    document.getElementById("menuTotalProductos").innerText = DB.productos.length + " productos";
    const menuAlm = document.getElementById("menuTotalAlmacenes");
    if (menuAlm) menuAlm.innerText = DB.almacenes.length + " almacén" + (DB.almacenes.length !== 1 ? "es" : "");

    // Saludo dinámico según hora
    const hora = new Date().getHours();
    const saludoTxt = hora < 12 ? "Buenos días," : hora < 18 ? "Buenas tardes," : "Buenas noches,";
    document.getElementById("saludoHora").innerText = saludoTxt;
    document.getElementById("nombreNegocio").innerText = (cfg.nombreNegocio || "Mi Negocio") + " 👋";
    const avatarEl = document.getElementById("headerEmoji");
    if (avatarEl) avatarEl.innerText = cfg.emoji || "🏪";

    const alertaEl = document.getElementById("heroAlerta");
    if (est.stockBajo > 0) { alertaEl.style.display = "flex"; document.getElementById("heroStockBajo").innerText = est.stockBajo; }
    else alertaEl.style.display = "none";

    // ── Puntuación de salud del negocio ──
    let puntaje = 0;
    const ahora = new Date();
    const mes = ahora.getMonth(); const anio = ahora.getFullYear();

    // +20 si no hay tributos vencidos
    const tributos = calcularTributos(ingresosDelMes(mes, anio), gastosDelMes(mes, anio), mes, anio);
    const pagos = cfg.onatPagos || {};
    const vencidos = Object.values(tributos).filter(t => {
        if (!t.esAplicable || t.importe === 0) return false;
        const clave = `${anio}-${mes}-${t.codigo}`;
        const lim = new Date(anio, mes, t.diaLimite, 23, 59, 59);
        return ahora > lim && !pagos[clave];
    });
    if (vencidos.length === 0) puntaje += 20;

    // +20 si no hay stock crítico (en cero)
    const sinStock = DB.productos.filter(p => p.cantidad === 0).length;
    if (sinStock === 0) puntaje += 20;

    // +20 si la ganancia del mes es positiva
    const iniMes = new Date(anio, mes, 1), finMes = new Date(anio, mes+1, 0, 23, 59, 59);
    const ventasMes = DB.movimientos.filter(m => m.tipo === "salida" && new Date(m.fecha) >= iniMes && new Date(m.fecha) <= finMes);
    const gananciaMes = ventasMes.reduce((s, m) => s + ((m.precioUnitario||0) - (typeof m.costoReal==="number"?m.costoReal:0)) * (m.cantidad||0), 0);
    if (gananciaMes > 0) puntaje += 20;

    // +20 si no hay clientes morosos (rojo)
    const morosos = DB.clientes.filter(c => DB.nivelRiesgo(c.id) === "rojo").length;
    if (morosos === 0) puntaje += 20;

    // +20 si tiene respaldo reciente (configuración tiene nombreNegocio al menos)
    if (cfg.nombreNegocio) puntaje += 20;

    const estadoSalud = puntaje >= 80 ? "Excelente" : puntaje >= 60 ? "Bueno" : puntaje >= 40 ? "Regular" : "Necesita atención";
    const colorSalud = puntaje >= 80 ? "var(--accent)" : puntaje >= 60 ? "var(--gold)" : puntaje >= 40 ? "#f97316" : "var(--warn)";
    document.getElementById("saludPuntaje").innerText = puntaje + "%";
    document.getElementById("saludPuntaje").style.color = colorSalud;
    document.getElementById("saludEstado").innerText = estadoSalud;
    document.getElementById("saludEstado").style.color = colorSalud;

    // ── Panel Inteligente con prioridades ──
    const alertas = [];

    // 🔴 CRÍTICAS
    if (vencidos.length > 0)
        alertas.push({ nivel: "rojo", icono: "🏛️", modulo: "ONAT", msg: `${vencidos.length} tributo${vencidos.length>1?"s":""} vencido${vencidos.length>1?"s":""} — Paga urgente`, accionNombre: "abrirONAT" });

    const sinStockProds = DB.productos.filter(p => p.cantidad === 0);
    if (sinStockProds.length > 0)
        alertas.push({ nivel: "rojo", icono: "📦", modulo: "Inventario", msg: `${sinStockProds.length} producto${sinStockProds.length>1?"s":""} sin stock (agotado${sinStockProds.length>1?"s":""})`, accionNombre: "abrirInventario" });

    // 🟠 IMPORTANTES
    if (est.stockBajo > 0)
        alertas.push({ nivel: "naranja", icono: "⚠️", modulo: "Inventario", msg: `${est.stockBajo} producto${est.stockBajo>1?"s":""} con stock bajo`, accionNombre: "abrirInventario" });

    // Próximos vencimientos ONAT (≤5 días) — agrupados por días restantes
    const proxONATGrupos = {};
    Object.values(tributos).filter(t => {
        if (!t.esAplicable || t.importe === 0) return false;
        const clave = `${anio}-${mes}-${t.codigo}`;
        if (pagos[clave]) return false;
        const lim = new Date(anio, mes, t.diaLimite);
        const dias = Math.ceil((lim - ahora) / (1000*60*60*24));
        return dias >= 0 && dias <= 5;
    }).forEach(t => {
        const dias = Math.ceil((new Date(anio, mes, t.diaLimite) - ahora) / (1000*60*60*24));
        const key = dias;
        if (!proxONATGrupos[key]) proxONATGrupos[key] = { dias, codigos: [] };
        proxONATGrupos[key].codigos.push(t.codigo);
    });
    Object.values(proxONATGrupos).forEach(g => {
        const txt = g.codigos.length === 1
            ? `${g.codigos[0]} vence en ${g.dias} día${g.dias!==1?"s":""}`
            : `${g.codigos.length} tributos vencen en ${g.dias} día${g.dias!==1?"s":""}`;
        alertas.push({ nivel: "naranja", icono: "🏛️", modulo: "ONAT", msg: txt, accionNombre: "abrirONAT" });
    });

    if (morosos > 0)
        alertas.push({ nivel: "naranja", icono: "👥", modulo: "Clientes", msg: `${morosos} cliente${morosos>1?"s":""} con deuda vencida`, accionNombre: "abrirClientes" });

    // 🔵 INFORMATIVAS
    if (gananciaMes > 0)
        alertas.push({ nivel: "azul", icono: "📈", modulo: "Reportes", msg: `Ganancia neta del mes: ${gananciaMes.toLocaleString("es-CU")} ${moneda}`, accionNombre: "abrirReportes" });

    // Proveedores sin comprar hace más de 30 días
    const hace30 = new Date(); hace30.setDate(ahora.getDate() - 30);
    DB.proveedores.filter(p => p.favorito).forEach(p => {
        const ultCompra = DB.comprasProveedor(p.nombre).sort((a,b) => new Date(b.fecha)-new Date(a.fecha))[0];
        if (!ultCompra || new Date(ultCompra.fecha) < hace30) {
            const dias = ultCompra ? Math.floor((ahora-new Date(ultCompra.fecha))/(1000*60*60*24)) : null;
            alertas.push({ nivel: "azul", icono: "🤝", modulo: "Proveedores", msg: `No compras a ${p.nombre} desde hace ${dias||"+"} días`, accionNombre: "abrirProveedores" });
        }
    });

    // Tendencia de precios (productos con aumento >5% en última compra)
    DB.productos.forEach(p => {
        const compras = DB.movimientos.filter(m => m.tipo==="entrada" && m.productoId===p.id).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
        if (compras.length >= 2) {
            const ult = compras[0].precioUnitario || 0;
            const ant = compras[1].precioUnitario || 0;
            if (ant > 0) {
                const pct = Math.round(((ult-ant)/ant)*100);
                if (pct >= 5)
                    alertas.push({ nivel: "azul", icono: "💹", modulo: "Inventario", msg: `${p.nombre} subió ${pct}% respecto a la última compra`, accionNombre: "abrirInventario" });
            }
        }
    });

    const panelEl = document.getElementById("panelInteligente");
    const btnVerTodas = document.getElementById("btnVerTodasAlertas");
    if (alertas.length === 0) {
        panelEl.innerHTML = `<div class="alerta-item" style="border-color:rgba(0,232,150,0.2);">
            <span>✅</span><div class="alerta-info"><strong>Todo en orden</strong><span>No hay alertas pendientes</span></div></div>`;
        if (btnVerTodas) btnVerTodas.classList.add("oculto");
    } else {
        const orden = { rojo: 0, naranja: 1, azul: 2 };
        alertas.sort((a,b) => orden[a.nivel]-orden[b.nivel]);
        // Máximo 4 alertas visibles
        const visibles = alertas.slice(0, 4);
        panelEl.innerHTML = visibles.map(a => {
            const color = a.nivel==="rojo" ? "rgba(255,107,74,0.15)" : a.nivel==="naranja" ? "rgba(245,197,66,0.15)" : "rgba(99,179,237,0.1)";
            const borde = a.nivel==="rojo" ? "rgba(255,107,74,0.3)" : a.nivel==="naranja" ? "rgba(245,197,66,0.3)" : "rgba(99,179,237,0.2)";
            const colorIcono = a.nivel==="rojo" ? "var(--warn)" : a.nivel==="naranja" ? "var(--gold)" : "#63b3ed";
            return `<div class="alerta-item" style="background:${color};border-color:${borde};" onclick="${a.accionNombre}()">
                <div style="width:36px;height:36px;border-radius:10px;background:${color};border:1.5px solid ${borde};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;">${a.icono}</div>
                <div class="alerta-info"><strong style="color:${colorIcono};">${a.modulo}</strong><span>${a.msg}</span></div>
                <span class="alerta-arrow">›</span>
            </div>`;
        }).join("");
        // Botón "Ver todas" solo si hay más de 4
        if (btnVerTodas) btnVerTodas.classList.toggle("oculto", alertas.length <= 4);
    }

    // Recientes
    const recientes = [...DB.productos].slice(-3).reverse();
    const seccion = document.getElementById("seccionRecientes");
    const lista = document.getElementById("productosRecientes");
    if (recientes.length > 0) {
        seccion.style.display = "flex";
        lista.innerHTML = recientes.map(p => `
            <div class="producto-row" onclick="abrirInventario()">
                <div class="prod-avatar">${ICONOS[p.categoria] || "📦"}</div>
                <div class="prod-info">
                    <h4>${p.nombre}</h4>
                    <p>${p.categoria || "—"} · ${p.almacen || "—"}</p>
                </div>
                <div class="prod-price">
                    <strong>${(p.venta||0).toLocaleString("es-CU")} ${moneda}</strong>
                    <span>${p.cantidad || 0} ${p.unidad || ""}</span>
                </div>
            </div>`).join("");
    } else { seccion.style.display = "none"; lista.innerHTML = ""; }

    alertasInteligentes();
}

function verTodasLasAlertas() {
    // Muestra todas las alertas expandiendo el panel
    const btnVerTodas = document.getElementById("btnVerTodasAlertas");
    if (btnVerTodas) btnVerTodas.classList.add("oculto");
    // Re-render sin límite de 4
    actualizarInicio();
    const panelEl = document.getElementById("panelInteligente");
    // Override: show all (actualizarInicio already computed all alerts, we just need to expand)
    panelEl.querySelectorAll(".alerta-item").forEach(el => el.style.display = "flex");
}

function alertasInteligentes() {
    const contenedor = document.getElementById("alertasInteligentes");
    if (!contenedor) return;

    const hoy = new Date();
    const hace30 = new Date(); hace30.setDate(hoy.getDate() - 30);
    const alertas = [];

    DB.productos.forEach(p => {
        if (p.cantidad <= 0) return;
        // Ventas de los últimos 30 días para este producto
        const ventas = DB.movimientos.filter(m =>
            m.productoId === p.id && m.tipo === "salida" && new Date(m.fecha) >= hace30
        );
        const totalVendido = ventas.reduce((s, m) => s + (m.cantidad || 0), 0);
        if (totalVendido === 0) return; // Sin historial de ventas, no podemos proyectar

        const ventasPorDia = totalVendido / 30;
        const diasRestantes = Math.floor(p.cantidad / ventasPorDia);

        if (diasRestantes <= 7) {
            alertas.push({ p, diasRestantes, ventasPorDia });
        }
    });

    if (alertas.length === 0) {
        contenedor.style.display = "none";
        return;
    }

    alertas.sort((a, b) => a.diasRestantes - b.diasRestantes);
    contenedor.style.display = "block";
    contenedor.innerHTML = `
        <div class="alertas-header">⚡ Alertas de reposición</div>
        ${alertas.slice(0, 3).map(({ p, diasRestantes }) => {
            const urgencia = diasRestantes <= 2 ? "🔴" : diasRestantes <= 4 ? "🟡" : "🟠";
            const msg = diasRestantes <= 1
                ? "¡Se agota hoy!"
                : `Se agota en ${diasRestantes} día${diasRestantes !== 1 ? "s" : ""}`;
            return `
            <div class="alerta-item" onclick="abrirInventario()">
                <span>${urgencia}</span>
                <div class="alerta-info">
                    <strong>${p.nombre}</strong>
                    <span>${msg} · ${p.cantidad} ${p.unidad || "uds"} restantes</span>
                </div>
                <span class="alerta-arrow">›</span>
            </div>`;
        }).join("")}
    `;
}

// ═══════════════════════════════════════════════
// TARJETA NEGOCIO EN CONFIG
// ═══════════════════════════════════════════════
function actualizarTarjetaNegocio() {
    const cfg = DB.configuracion;
    document.getElementById("cfgCardEmoji").innerText = cfg.emoji || "🏪";
    document.getElementById("cfgCardNombre").innerText = cfg.nombreNegocio || "Mi Negocio";
    document.getElementById("cfgCardSub").innerText =
        (cfg.propietario ? cfg.propietario + " · " : "") + (cfg.regimenFiscal || "TCP");
}

// ═══════════════════════════════════════════════
// MODAL PRODUCTO
// ═══════════════════════════════════════════════
function abrirModalProducto() {
    editandoId = null;
    limpiarFormulario();
    document.getElementById("modalTitulo").innerText = "📦 Nuevo Producto";
    document.getElementById("guardarProducto").innerText = "💾 Guardar Producto";
    document.getElementById("modalProducto").classList.remove("oculto");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
}

function cerrarModalProducto() {
    document.getElementById("modalProducto").classList.add("oculto");
    document.getElementById("btnFlotante").classList.remove("ocultar-boton");
    limpiarFormulario();
}

document.getElementById("btnMasDetalles").addEventListener("click", () => {
    const sec = document.getElementById("masDetalles");
    const btn = document.getElementById("btnMasDetalles");
    if (sec.classList.contains("oculto")) { sec.classList.remove("oculto"); btn.innerText = "－ Ocultar detalles"; }
    else { sec.classList.add("oculto"); btn.innerText = "＋ Más detalles (opcional)"; }
});

// ═══════════════════════════════════════════════
// PRECIOS POR CANTIDAD (ESCALAS MAYORISTAS)
// ═══════════════════════════════════════════════
function toggleEscalasProducto() {
    const activo = document.getElementById("usaEscalas").checked;
    document.getElementById("escalasContenedor").classList.toggle("oculto", !activo);
    if (activo && escalasTemp.length === 0) {
        escalasTemp.push({ cantidadMin: 5, precio: 0, nombre: "Mayorista" });
        renderEscalasProducto();
    }
}

function agregarEscalaProducto() {
    escalasTemp.push({ cantidadMin: "", precio: "", nombre: "" });
    renderEscalasProducto();
}

function eliminarEscalaProducto(idx) {
    escalasTemp.splice(idx, 1);
    renderEscalasProducto();
}

function actualizarEscalaProducto(idx, campo, valor) {
    if (!escalasTemp[idx]) return;
    escalasTemp[idx][campo] = (campo === "cantidadMin" || campo === "precio") ? Number(valor) : valor;
}

function renderEscalasProducto() {
    const lista = document.getElementById("escalasLista");
    if (!lista) return;
    if (escalasTemp.length === 0) {
        lista.innerHTML = `<p style="font-size:12px;color:var(--text2);">Sin escalas. Toca "Agregar escala" para crear la primera.</p>`;
        return;
    }
    lista.innerHTML = escalasTemp.map((e, idx) => `
        <div style="background:var(--surface2); border:1px solid var(--border); border-radius:12px; padding:10px 12px; display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; gap:8px; align-items:center;">
                <input type="text" placeholder="Nombre (Ej: Mayorista)" value="${e.nombre || ''}"
                    oninput="actualizarEscalaProducto(${idx}, 'nombre', this.value)"
                    style="flex:1; padding:8px 10px; border-radius:8px; border:1px solid var(--border); background:var(--surface); color:var(--text); font-size:13px;">
                <button type="button" onclick="eliminarEscalaProducto(${idx})" style="background:rgba(255,107,74,0.1); border:1px solid rgba(255,107,74,0.2); color:var(--warn); width:32px; height:32px; border-radius:8px; cursor:pointer; flex-shrink:0;">✕</button>
            </div>
            <div style="display:flex; gap:8px;">
                <div style="flex:1;">
                    <span style="font-size:10px; color:var(--text2); display:block; margin-bottom:3px;">Desde (cantidad)</span>
                    <input type="number" min="1" value="${e.cantidadMin || ''}" placeholder="5"
                        oninput="actualizarEscalaProducto(${idx}, 'cantidadMin', this.value)"
                        style="width:100%; padding:8px 10px; border-radius:8px; border:1px solid var(--border); background:var(--surface); color:var(--text); font-size:13px;">
                </div>
                <div style="flex:1;">
                    <span style="font-size:10px; color:var(--text2); display:block; margin-bottom:3px;">Precio unitario</span>
                    <input type="number" min="0" value="${e.precio || ''}" placeholder="1350"
                        oninput="actualizarEscalaProducto(${idx}, 'precio', this.value)"
                        style="width:100%; padding:8px 10px; border-radius:8px; border:1px solid var(--border); background:var(--surface); color:var(--text); font-size:13px;">
                </div>
            </div>
        </div>`).join("");
}

// Devuelve la escala aplicable para una cantidad dada (la de mayor cantidadMin que califique)
function escalaAplicable(producto, cantidad) {
    if (!producto.escalas || producto.escalas.length === 0) return null;
    const validas = producto.escalas.filter(e => cantidad >= e.cantidadMin).sort((a, b) => b.cantidadMin - a.cantidadMin);
    return validas.length > 0 ? validas[0] : null;
}

document.getElementById("guardarProducto").addEventListener("click", () => {
    const nombre = document.getElementById("nombre").value.trim();
    const cantidad = document.getElementById("cantidad").value;
    const compra = document.getElementById("compra").value;
    const venta = document.getElementById("venta").value;
    if (!nombre) { alert("⚠️ El nombre es obligatorio."); return; }
    if (!cantidad || !compra || !venta) { alert("⚠️ Cantidad, Compra y Venta son obligatorios."); return; }

    const usaEscalas = document.getElementById("usaEscalas").checked;
    let escalas = [];
    if (usaEscalas) {
        escalas = escalasTemp.filter(e => e.cantidadMin > 0 && e.precio > 0 && e.nombre && e.nombre.trim());
        if (escalas.length === 0) { alert("⚠️ Activaste precios por cantidad pero no hay escalas válidas. Completa nombre, cantidad y precio, o desactiva la opción."); return; }
        escalas.sort((a, b) => a.cantidadMin - b.cantidadMin);
    }

    const producto = {
        nombre, categoria: document.getElementById("categoria").value,
        cantidad: Number(cantidad), unidad: document.getElementById("unidad").value,
        compra: Number(compra), venta: Number(venta),
        almacen: document.getElementById("almacen").value,
        marca: document.getElementById("marca").value,
        proveedor: document.getElementById("proveedor").value,
        stockMinimo: Number(document.getElementById("stock").value) || 0,
        codigoBarras: document.getElementById("codigoBarras").value,
        vencimiento: document.getElementById("vencimiento").value,
        observaciones: document.getElementById("observaciones").value,
        escalas
    };

    if (editandoId === null) {
        // Todo producto nuevo nace con sistema de lotes FIFO activo
        producto.usaFifo = true;
        producto.lotes = [{
            id: "lote_" + Date.now(),
            cantidad: producto.cantidad,
            costo: producto.compra,
            fecha: new Date().toISOString()
        }];
        const nuevo = DB.agregarProducto(producto);
        DB.registrarMovimiento("entrada", nuevo.id, {
            cantidad: nuevo.cantidad, precioUnitario: nuevo.compra,
            proveedor: nuevo.proveedor, nota: "Entrada inicial"
        });
        alert("✅ Producto guardado.");
    } else {
        DB.actualizarProducto(editandoId, producto);
        alert("✅ Producto actualizado.");
        editandoId = null;
    }
    cerrarModalProducto();
    actualizarInicio();
    if (document.getElementById("pantallaInventario").classList.contains("activa")) mostrarInventario();
});

function limpiarFormulario() {
    ["nombre","marca","proveedor","observaciones","codigoBarras"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    ["categoria","unidad","almacen"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    ["cantidad","stock","compra","venta"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    document.getElementById("vencimiento").value = "";
    document.getElementById("masDetalles").classList.add("oculto");
    document.getElementById("btnMasDetalles").innerText = "＋ Más detalles (opcional)";
    document.getElementById("usaEscalas").checked = false;
    document.getElementById("escalasContenedor").classList.add("oculto");
    escalasTemp = [];
    renderEscalasProducto();
    const tpEl = document.getElementById("textoProveedorSel");
    if (tpEl) { tpEl.className = "texto-prod-placeholder"; tpEl.innerText = "Toca para seleccionar proveedor..."; }
}

// ═══════════════════════════════════════════════
// INVENTARIO
// ═══════════════════════════════════════════════
function mostrarInventario() {
    const lista = document.getElementById("listaProductos");
    const texto = document.getElementById("buscar").value.toLowerCase();
    const orden = document.getElementById("ordenar").value;
    const ubicacion = document.getElementById("filtroUbicacion").value;

    lista.className = vistaActual === "tarjeta" ? "vista-tarjeta" : "vista-lista";

    let filtrados = DB.productos.filter(p => {
        const t = p.nombre.toLowerCase().includes(texto) ||
            (p.categoria && p.categoria.toLowerCase().includes(texto)) ||
            (p.marca && p.marca.toLowerCase().includes(texto)) ||
            (p.codigoBarras && p.codigoBarras.includes(texto));
        const u = !ubicacion || p.almacen === ubicacion;
        const s = !soloStockBajo || p.cantidad <= p.stockMinimo;
        return t && u && s;
    });

    filtrados.sort((a, b) => {
        if (orden === "nombre") return a.nombre.localeCompare(b.nombre);
        if (orden === "cantidad") return b.cantidad - a.cantidad;
        if (orden === "compra") return b.compra - a.compra;
        if (orden === "fecha") return new Date(b.fechaCreacion) - new Date(a.fechaCreacion);
        return 0;
    });

    document.getElementById("invSubtitulo").innerText = filtrados.length + " productos";
    lista.innerHTML = "";

    if (filtrados.length === 0) {
        lista.innerHTML = `<p style="text-align:center;color:var(--text2);padding:40px 0;">No se encontraron productos.</p>`;
        actualizarResumen([]);
        return;
    }

    if (agruparPorCategoria) {
        const grupos = {};
        filtrados.forEach(p => {
            const cat = p.categoria || "Sin categoría";
            if (!grupos[cat]) grupos[cat] = [];
            grupos[cat].push(p);
        });
        lista.className = "";
        Object.keys(grupos).sort().forEach(cat => {
            const grupoId = "grupo_" + cat.replace(/\s/g, "_");
            lista.innerHTML += `
            <div class="grupo-header" onclick="toggleGrupo('${grupoId}')">
                ${ICONOS[cat] || "📦"} ${cat}
                <span>${grupos[cat].length} productos ▾</span>
            </div>
            <div id="${grupoId}" class="grupo-contenido ${vistaActual === 'tarjeta' ? 'vista-tarjeta' : 'vista-lista'}">
                ${grupos[cat].map(p => renderProducto(p)).join("")}
            </div>`;
        });
    } else {
        filtrados.forEach(p => { lista.innerHTML += renderProducto(p); });
    }
    actualizarResumen(filtrados);
}

function renderProducto(p) {
    const bajo = p.cantidad <= p.stockMinimo;
    const badge = bajo ? `<span class="badge-stock">⚠️</span>` : "";
    const icono = ICONOS[p.categoria] || "📦";
    const moneda = DB.configuracion.moneda || "CUP";
    const ocultarCompra = DB.configuracion.ocultarCompra;
    const costosDistintos = p.usaFifo && p.lotes && new Set(p.lotes.map(l => l.costo)).size > 1;
    const badgeFifo = costosDistintos ? `<span class="badge-fifo">📦 ${p.lotes.length} lotes</span>` : "";
    const badgeEscalas = (p.escalas && p.escalas.length > 0) ? `<span class="badge-escalas">🏷️ Mayorista</span>` : "";

    if (vistaActual === "tarjeta") {
        return `
        <div class="producto-card-grid ${bajo ? 'stock-bajo' : ''}" onclick="abrirSheetAcciones('${p.id}')">
            <div class="card-tap-hint">Toca para acciones</div>
            <h3>${icono} ${p.nombre}${badge}</h3>
            <div class="precio">${(p.venta||0).toLocaleString("es-CU")} ${moneda}${badgeEscalas}</div>
            ${!ocultarCompra ? `<div class="precio-compra">Compra: ${(p.compra||0).toLocaleString("es-CU")} ${moneda}${badgeFifo}</div>` : ''}
            <div class="cantidad">${p.cantidad} ${p.unidad || ""}</div>
            <div class="ubicacion">📍 ${p.almacen || "—"}</div>
        </div>`;
    } else {
        return `
        <div class="producto-fila ${bajo ? 'stock-bajo' : ''}" onclick="abrirSheetAcciones('${p.id}')">
            <div class="info-fila">
                <h3>${p.nombre}${badge}${badgeEscalas}</h3>
                <span>${p.cantidad} ${p.unidad||""} · ${p.almacen||"—"}${badgeFifo}</span>
            </div>
            <div class="precios-fila">
                <div class="pv">${(p.venta||0).toLocaleString("es-CU")} ${moneda}</div>
                ${!ocultarCompra ? `<div class="pc">${(p.compra||0).toLocaleString("es-CU")} ${moneda}</div>` : ''}
            </div>
            <div class="fila-accion-hint">›</div>
        </div>`;
    }
}

function toggleGrupo(id) { const el = document.getElementById(id); if (el) el.style.display = el.style.display === "none" ? "" : "none"; }

function actualizarResumen(lista) {
    let capital = 0, ganancia = 0;
    lista.forEach(p => {
        capital += (p.compra||0) * (p.cantidad||0);
        ganancia += ((p.venta||0) - (p.compra||0)) * (p.cantidad||0);
    });
    const moneda = DB.configuracion.moneda || "CUP";
    document.getElementById("resumenCapital").innerText = capital.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("resumenGanancia").innerText = ganancia.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("resumenTotal").innerText = lista.length;
}

function cambiarVista(tipo) {
    vistaActual = tipo;
    document.getElementById("btnVistaTarjeta").classList.toggle("activo", tipo === "tarjeta");
    document.getElementById("btnVistaLista").classList.toggle("activo", tipo === "lista");
    mostrarInventario();
}

function toggleMenuOpciones() { document.getElementById("menuOpciones").classList.toggle("oculto"); }

function toggleStockBajo() {
    soloStockBajo = !soloStockBajo;
    document.getElementById("btnStockBajo").innerText = soloStockBajo ? "✅ Mostrando stock bajo" : "⚠️ Solo stock bajo";
    document.getElementById("menuOpciones").classList.add("oculto");
    mostrarInventario();
}

function toggleGrupos() {
    agruparPorCategoria = !agruparPorCategoria;
    document.getElementById("btnGrupos").innerText = agruparPorCategoria ? "✅ Agrupado por categoría" : "📂 Agrupar por categoría";
    document.getElementById("menuOpciones").classList.add("oculto");
    mostrarInventario();
}

function editarProducto(id) {
    const p = DB.buscarProducto(id); if (!p) return;
    editandoId = id;
    document.getElementById("nombre").value = p.nombre || "";
    document.getElementById("categoria").value = p.categoria || "";
    document.getElementById("cantidad").value = p.cantidad || "";
    document.getElementById("unidad").value = p.unidad || "";
    document.getElementById("compra").value = p.compra || "";
    document.getElementById("venta").value = p.venta || "";
    document.getElementById("almacen").value = p.almacen || "";
    document.getElementById("marca").value = p.marca || "";
    document.getElementById("proveedor").value = p.proveedor || "";
    const tpEl = document.getElementById("textoProveedorSel");
    if (tpEl && p.proveedor) { tpEl.className = "texto-prod-seleccionado"; tpEl.innerText = `🤝 ${p.proveedor}`; }
    else if (tpEl) { tpEl.className = "texto-prod-placeholder"; tpEl.innerText = "Toca para seleccionar proveedor..."; }
    document.getElementById("stock").value = p.stockMinimo || "";
    document.getElementById("vencimiento").value = p.vencimiento || "";
    document.getElementById("observaciones").value = p.observaciones || "";
    document.getElementById("codigoBarras").value = p.codigoBarras || "";
    escalasTemp = (p.escalas && p.escalas.length > 0) ? JSON.parse(JSON.stringify(p.escalas)) : [];
    document.getElementById("usaEscalas").checked = escalasTemp.length > 0;
    document.getElementById("escalasContenedor").classList.toggle("oculto", escalasTemp.length === 0);
    renderEscalasProducto();
    document.getElementById("modalTitulo").innerText = "✏️ Editar Producto";
    document.getElementById("guardarProducto").innerText = "💾 Actualizar Producto";
    document.getElementById("modalProducto").classList.remove("oculto");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
}

function duplicarProducto(id) {
    const p = DB.buscarProducto(id); if (!p) return;
    editandoId = null;
    document.getElementById("nombre").value = p.nombre + " (copia)";
    document.getElementById("categoria").value = p.categoria || "";
    document.getElementById("cantidad").value = p.cantidad || "";
    document.getElementById("unidad").value = p.unidad || "";
    document.getElementById("compra").value = p.compra || "";
    document.getElementById("venta").value = p.venta || "";
    document.getElementById("almacen").value = p.almacen || "";
    document.getElementById("marca").value = p.marca || "";
    document.getElementById("proveedor").value = p.proveedor || "";
    document.getElementById("stock").value = p.stockMinimo || "";
    document.getElementById("vencimiento").value = p.vencimiento || "";
    document.getElementById("observaciones").value = p.observaciones || "";
    document.getElementById("codigoBarras").value = "";
    escalasTemp = (p.escalas && p.escalas.length > 0) ? JSON.parse(JSON.stringify(p.escalas)) : [];
    document.getElementById("usaEscalas").checked = escalasTemp.length > 0;
    document.getElementById("escalasContenedor").classList.toggle("oculto", escalasTemp.length === 0);
    renderEscalasProducto();
    document.getElementById("modalTitulo").innerText = "📋 Duplicar Producto";
    document.getElementById("guardarProducto").innerText = "💾 Guardar Copia";
    document.getElementById("modalProducto").classList.remove("oculto");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
}

function eliminarProducto(id) {
    if (confirm("¿Eliminar este producto?")) { DB.eliminarProducto(id); mostrarInventario(); actualizarInicio(); }
}

// ═══════════════════════════════════════════════
// EXPORTAR / IMPORTAR / IMPRIMIR
// ═══════════════════════════════════════════════
function exportarPDF() {
    const el = document.getElementById("menuOpciones");
    if (el) el.classList.add("oculto");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const cfg = DB.configuracion;
    doc.setFontSize(16);
    doc.text("INVENTARY ARB — " + (cfg.nombreNegocio || "Mi Negocio"), 14, 15);
    doc.setFontSize(10);
    doc.text("Generado: " + new Date().toLocaleDateString("es-CU"), 14, 22);
    if (cfg.propietario) doc.text("Propietario: " + cfg.propietario, 14, 28);
    doc.autoTable({
        startY: cfg.propietario ? 34 : 28,
        head: [["Nombre","Categoría","Cantidad","Compra","Venta","Ubicación"]],
        body: DB.productos.map(p => [
            p.nombre, p.categoria||"—", `${p.cantidad} ${p.unidad||""}`,
            cfg.ocultarCompra ? "—" : (p.compra||0).toLocaleString("es-CU") + " " + (cfg.moneda||"CUP"),
            (p.venta||0).toLocaleString("es-CU") + " " + (cfg.moneda||"CUP"),
            p.almacen||"—"
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [0, 184, 122] }
    });
    if (cfg.piePagina) {
        const pageHeight = doc.internal.pageSize.height;
        doc.setFontSize(9); doc.setTextColor(150);
        doc.text(cfg.piePagina, 14, pageHeight - 10);
    }
    doc.save("inventario-arb.pdf");
}

function exportarExcel() {
    const el = document.getElementById("menuOpciones");
    if (el) el.classList.add("oculto");
    const datos = DB.productos.map(p => ({
        Nombre: p.nombre, Categoría: p.categoria||"", Cantidad: p.cantidad, Unidad: p.unidad||"",
        "Precio Compra": p.compra, "Precio Venta": p.venta, Ubicación: p.almacen||"",
        Marca: p.marca||"", Proveedor: p.proveedor||"", "Stock Mínimo": p.stockMinimo||0,
        "Código Barras": p.codigoBarras||"", Vencimiento: p.vencimiento||""
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");
    XLSX.writeFile(wb, "inventario-arb.xlsx");
}

function imprimirInventario() {
    const el = document.getElementById("menuOpciones");
    if (el) el.classList.add("oculto");
    const cfg = DB.configuracion;
    let html = `<html><head><title>Inventario</title>
    <style>body{font-family:Arial;font-size:12px;}table{width:100%;border-collapse:collapse;}
    th{background:#0f8b74;color:white;padding:8px;text-align:left;}
    td{padding:6px 8px;border-bottom:1px solid #eee;}h2{color:#0f8b74;}.total{font-weight:bold;background:#f0faf7;}
    footer{margin-top:20px;font-size:11px;color:#888;}</style></head><body>
    <h2>INVENTARY ARB — ${cfg.nombreNegocio||"Mi Negocio"}</h2>
    <p>Generado: ${new Date().toLocaleDateString("es-CU")}${cfg.propietario ? " · " + cfg.propietario : ""}</p>
    <table><tr><th>Nombre</th><th>Categoría</th><th>Cantidad</th><th>Compra</th><th>Venta</th><th>Ubicación</th></tr>`;
    let capital = 0, venta = 0;
    DB.productos.forEach(p => {
        capital += (p.compra||0) * (p.cantidad||0);
        venta += (p.venta||0) * (p.cantidad||0);
        html += `<tr><td>${p.nombre}</td><td>${p.categoria||"—"}</td>
            <td>${p.cantidad} ${p.unidad||""}</td>
            <td>${cfg.ocultarCompra ? "—" : (p.compra||0).toLocaleString("es-CU") + " " + (cfg.moneda||"CUP")}</td>
            <td>${(p.venta||0).toLocaleString("es-CU")} ${cfg.moneda||"CUP"}</td>
            <td>${p.almacen||"—"}</td></tr>`;
    });
    html += `<tr class="total"><td colspan="3">TOTAL (${DB.productos.length} productos)</td>
        <td>${cfg.ocultarCompra ? "—" : capital.toLocaleString("es-CU") + " " + (cfg.moneda||"CUP")}</td>
        <td>${venta.toLocaleString("es-CU")} ${cfg.moneda||"CUP"}</td><td></td></tr>
    </table>${cfg.piePagina ? `<footer>${cfg.piePagina}</footer>` : ""}
    </body></html>`;
    const win = window.open("", "_blank");
    win.document.write(html); win.document.close(); win.print();
}

function importarCSV() {
    const el = document.getElementById("menuOpciones");
    if (el) el.classList.add("oculto");
    document.getElementById("archivoImportar").click();
}

document.getElementById("archivoImportar").addEventListener("change", (e) => {
    const archivo = e.target.files[0]; if (!archivo) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const wb = XLSX.read(ev.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const datos = XLSX.utils.sheet_to_json(ws);
        let importados = 0;
        datos.forEach(row => {
            if (!row["Nombre"]) return;
            DB.agregarProducto({
                nombre: row["Nombre"]||"", categoria: row["Categoría"]||"",
                cantidad: Number(row["Cantidad"])||0, unidad: row["Unidad"]||"",
                compra: Number(row["Precio Compra"])||0, venta: Number(row["Precio Venta"])||0,
                almacen: row["Ubicación"]||"", marca: row["Marca"]||"",
                proveedor: row["Proveedor"]||"", stockMinimo: Number(row["Stock Mínimo"])||0,
                codigoBarras: row["Código Barras"]||"", vencimiento: row["Vencimiento"]||"", observaciones: ""
            });
            importados++;
        });
        actualizarInicio(); mostrarInventario();
        alert(`✅ ${importados} productos importados.`);
    };
    reader.readAsBinaryString(archivo);
    e.target.value = "";
});

function compartirWhatsApp() {
    const el = document.getElementById("menuOpciones");
    if (el) el.classList.add("oculto");
    const cfg = DB.configuracion;
    let txt = `📦 *INVENTARY ARB — ${cfg.nombreNegocio||"Mi Negocio"}*\n\n`;
    DB.productos.forEach(p => { txt += `• ${p.nombre} — ${p.cantidad} ${p.unidad||""} — ${p.venta} ${cfg.moneda||"CUP"}\n`; });
    window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
}

document.getElementById("buscar").addEventListener("input", mostrarInventario);

// ═══════════════════════════════════════════════
// SHEET DE ACCIONES RÁPIDAS
// ═══════════════════════════════════════════════
function abrirSheetAcciones(id) {
    const p = DB.buscarProducto(id); if (!p) return;
    productoAccionId = id;
    document.getElementById("saIcono").innerText = ICONOS[p.categoria] || "📦";
    document.getElementById("saNombre").innerText = p.nombre;
    const stockTexto = `${p.cantidad} ${p.unidad || ""}`;
    const stockEl = document.getElementById("saStock");
    if (p.cantidad <= p.stockMinimo) stockEl.innerHTML = `<span style="color:var(--warn)">⚠️ ${stockTexto}</span>`;
    else stockEl.innerText = `📦 ${stockTexto}`;
    document.getElementById("saUbicacion").innerText = p.almacen || "—";
    const margen = p.compra > 0 ? Math.round(((p.venta - p.compra) / p.compra) * 100) : 0;
    const moneda = DB.configuracion.moneda || "CUP";
    document.getElementById("saCompra").innerText = DB.configuracion.ocultarCompra ? "—" : (p.compra||0).toLocaleString("es-CU") + " " + moneda;
    document.getElementById("saVenta").innerText = (p.venta||0).toLocaleString("es-CU") + " " + moneda;
    document.getElementById("saMargen").innerText = DB.configuracion.ocultarCompra ? "—" : margen + "%";

    const lotesEl = document.getElementById("saLotesDetalle");
    if (p.usaFifo && p.lotes && p.lotes.length > 1 && !DB.configuracion.ocultarCompra) {
        lotesEl.classList.remove("oculto");
        lotesEl.innerHTML = `<span class="sa-lotes-titulo">📦 Lotes FIFO (más viejo primero)</span>` +
            p.lotes.map(l => `<span class="sa-lote-item">${l.cantidad} ${p.unidad||"u"} a ${l.costo.toLocaleString("es-CU")} ${moneda}</span>`).join("");
    } else {
        lotesEl.classList.add("oculto");
        lotesEl.innerHTML = "";
    }

    document.getElementById("sheetAcciones").classList.remove("oculto");
}

function cerrarSheetAcciones() { document.getElementById("sheetAcciones").classList.add("oculto"); productoAccionId = null; }
function cerrarSheetAccionesSiOverlay(e) { if (e.target === document.getElementById("sheetAcciones")) cerrarSheetAcciones(); }

function accionRapida(accion) {
    const id = productoAccionId;
    cerrarSheetAcciones();
    setTimeout(() => {
        if (accion === "editar") editarProducto(id);
        else if (accion === "duplicar") duplicarProducto(id);
        else if (accion === "ajuste") abrirAjuste(id);
        else if (accion === "eliminar") eliminarProducto(id);
        else if (accion === "historial") verHistorialProducto(id);
        else if (accion === "entrada") irAMovimientoRapido(id, "entrada");
        else if (accion === "salida") irAMovimientoRapido(id, "salida");
    }, 220);
}

function verHistorialProducto(id) {
    const p = DB.buscarProducto(id); if (!p) return;
    abrirHistorial();
    setTimeout(() => { document.getElementById("buscarHistorial").value = p.nombre; mostrarHistorial(); }, 100);
}

function irAMovimientoRapido(id, tipo) {
    abrirMovimientos();
    setTimeout(() => { cambiarTab(tipo); seleccionarProductoMov(id); }, 150);
}

// ═══════════════════════════════════════════════
// MOVIMIENTOS
// ═══════════════════════════════════════════════
function cambiarTab(tipo) {
    tipoMovActual = tipo;
    limpiarFormMov();
    document.getElementById("tabEntrada").classList.toggle("activo", tipo === "entrada");
    document.getElementById("tabSalida").classList.toggle("activo", tipo === "salida");
    document.getElementById("camposEntrada").classList.toggle("oculto", tipo !== "entrada");
    document.getElementById("camposSalida").classList.toggle("oculto", tipo !== "salida");
    const btn = document.getElementById("btnRegistrarMov");
    if (tipo === "entrada") { btn.innerText = "📥 Registrar Entrada"; btn.style.background = "linear-gradient(135deg, #00e896, #00b87a)"; }
    else { btn.innerText = "📤 Registrar Salida"; btn.style.background = "linear-gradient(135deg, #ff6b4a, #e53935)"; }
    // Preseleccionar método de pago por defecto
    const mp = document.getElementById("movMetodoPago");
    if (mp) mp.value = DB.configuracion.metodoPagoDefault || "efectivo";
}

function abrirSheetProductos() {
    sheetModo = "movimiento";
    const ubicaciones = [...new Set(DB.productos.map(p => p.almacen).filter(Boolean))];
    const filtrosEl = document.getElementById("sheetFiltros");
    filtrosEl.innerHTML = `<button class="chip-filtro activo" data-filtro="" onclick="seleccionarFiltroSheet(this)">Todos</button>`;
    ubicaciones.forEach(ub => { filtrosEl.innerHTML += `<button class="chip-filtro" data-filtro="${ub}" onclick="seleccionarFiltroSheet(this)">📍 ${ub}</button>`; });
    sheetFiltroActivo = "";
    document.getElementById("sheetBuscador").value = "";
    renderSheetLista();
    document.getElementById("sheetProductos").classList.remove("oculto");
    setTimeout(() => { document.getElementById("sheetBuscador").focus(); }, 300);
}

function abrirSheetProductosTransferencia() {
    sheetModo = "transferencia";
    const a = DB.almacenes.find(al => al.id === almacenActualId);
    if (!a) return;
    const filtrosEl = document.getElementById("sheetFiltros");
    filtrosEl.innerHTML = `<button class="chip-filtro activo" data-filtro="${a.nombre}" onclick="seleccionarFiltroSheet(this)">📍 ${a.nombre}</button>`;
    sheetFiltroActivo = a.nombre;
    document.getElementById("sheetBuscador").value = "";
    renderSheetLista();
    document.getElementById("sheetProductos").classList.remove("oculto");
    setTimeout(() => { document.getElementById("sheetBuscador").focus(); }, 300);
}

function cerrarSheetProductos() { document.getElementById("sheetProductos").classList.add("oculto"); }
function cerrarSheetSiOverlay(e) { if (e.target === document.getElementById("sheetProductos")) cerrarSheetProductos(); }

function seleccionarFiltroSheet(btn) {
    document.querySelectorAll(".chip-filtro").forEach(c => c.classList.remove("activo"));
    btn.classList.add("activo");
    sheetFiltroActivo = btn.dataset.filtro;
    renderSheetLista();
}

function filtrarSheet() { renderSheetLista(); }

function renderSheetLista() {
    const texto = document.getElementById("sheetBuscador").value.toLowerCase().trim();
    const lista = document.getElementById("sheetLista");
    let productos = [...DB.productos].sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (sheetFiltroActivo) productos = productos.filter(p => p.almacen === sheetFiltroActivo);
    if (texto) productos = productos.filter(p =>
        p.nombre.toLowerCase().includes(texto) ||
        (p.categoria && p.categoria.toLowerCase().includes(texto)) ||
        (p.codigoBarras && p.codigoBarras.includes(texto))
    );
    document.getElementById("sheetContador").innerText = productos.length + " producto" + (productos.length !== 1 ? "s" : "");
    if (productos.length === 0) {
        lista.innerHTML = `<div class="sheet-vacio"><span>🔍</span>${texto ? "No hay productos con ese nombre." : "No hay productos en este almacén."}</div>`;
        return;
    }
    const moneda = DB.configuracion.moneda || "CUP";
    lista.innerHTML = productos.map(p => {
        const bajo = p.cantidad > 0 && p.cantidad <= p.stockMinimo;
        const sinStock = p.cantidad <= 0;
        return `
        <div class="sheet-item ${sinStock ? 'stock-cero' : ''}" onclick="${sheetModo === 'transferencia' ? `seleccionarProductoTransferencia('${p.id}')` : sheetModo === 'pos' ? `seleccionarProductoPOS('${p.id}')` : `seleccionarProductoMov('${p.id}')`}">
            <div class="si-icono">${ICONOS[p.categoria] || "📦"}</div>
            <div class="si-info"><h4>${p.nombre}</h4><p>${p.categoria || "Sin categoría"} · ${p.almacen || "—"}</p></div>
            <div class="si-stock">
                <strong>${(tipoMovActual === "salida" ? p.venta : p.compra || 0).toLocaleString("es-CU")} ${moneda}</strong>
                ${bajo ? `<span class="stock-warn">⚠️ ${p.cantidad} ${p.unidad||""}</span>` : `<span>${p.cantidad} ${p.unidad||""}</span>`}
            </div>
        </div>`;
    }).join("");
}

function seleccionarProductoMov(id) {
    const p = DB.buscarProducto(id); if (!p) return;
    productoMovSeleccionado = p;
    document.getElementById("movProducto").value = p.id;
    const textoEl = document.getElementById("textoProductoSel");
    textoEl.className = "texto-prod-seleccionado";
    textoEl.innerText = `${ICONOS[p.categoria]||"📦"} ${p.nombre}`;
    document.getElementById("prodSelNombre").innerText = `${ICONOS[p.categoria]||"📦"} ${p.nombre}`;
    document.getElementById("movStockActual").innerText = `${p.cantidad} ${p.unidad||""}`;
    document.getElementById("movUbicacion").innerText = p.almacen || "—";
    document.getElementById("productoSeleccionado").classList.remove("oculto");
    document.getElementById("movPrecio").value = tipoMovActual === "entrada" ? p.compra || "" : p.venta || "";
    document.getElementById("movEscalaSugerida").classList.add("oculto");
    cerrarSheetProductos();
    actualizarPrecioSugerido();
}

function actualizarPrecioSugerido() {
    const box = document.getElementById("movEscalaSugerida");
    if (tipoMovActual !== "salida" || !productoMovSeleccionado || !productoMovSeleccionado.escalas || productoMovSeleccionado.escalas.length === 0) {
        box.classList.add("oculto");
        return;
    }
    const cantidad = Number(document.getElementById("movCantidad").value);
    if (!cantidad || cantidad <= 0) { box.classList.add("oculto"); return; }
    const escala = escalaAplicable(productoMovSeleccionado, cantidad);
    if (!escala) { box.classList.add("oculto"); return; }
    document.getElementById("movEscalaNombre").innerText = `${escala.nombre} (${escala.cantidadMin}+ unidades)`;
    document.getElementById("movEscalaPrecio").innerText = escala.precio.toLocaleString("es-CU") + " " + (DB.configuracion.moneda || "CUP");
    document.getElementById("movPrecio").value = escala.precio;
    box.classList.remove("oculto");
}

function limpiarSeleccionProducto() {
    productoMovSeleccionado = null;
    document.getElementById("movProducto").value = "";
    document.getElementById("productoSeleccionado").classList.add("oculto");
    document.getElementById("movCantidad").value = "";
    document.getElementById("movPrecio").value = "";
    document.getElementById("movEscalaSugerida").classList.add("oculto");
    const textoEl = document.getElementById("textoProductoSel");
    textoEl.className = "texto-prod-placeholder";
    textoEl.innerText = "Toca para buscar un producto...";
}

function buscarPorCodigoMov() {
    const codigo = document.getElementById("movCodigoBarras").value.trim(); if (!codigo) return;
    const p = DB.buscarPorCodigo(codigo);
    if (p) seleccionarProductoMov(p.id);
    else alert("⚠️ No se encontró ningún producto con ese código.");
}

function limpiarFormMov() {
    limpiarSeleccionProducto();
    document.getElementById("movCodigoBarras").value = "";
    document.getElementById("movCantidad").value = "";
    document.getElementById("movPrecio").value = "";
    document.getElementById("movProveedor").value = "";
    document.getElementById("movFactura").value = "";
    document.getElementById("movNota").value = "";
    const cl = document.getElementById("movCliente"); if (cl) cl.value = "";
    const mp = document.getElementById("movMetodoPago"); if (mp) mp.value = DB.configuracion.metodoPagoDefault || "efectivo";
    // Reset fiado fields
    document.getElementById("campoFiado").classList.add("oculto");
    document.getElementById("movClienteId").value = "";
    document.getElementById("textoClienteSel").className = "texto-prod-placeholder";
    document.getElementById("textoClienteSel").innerText = "Toca para seleccionar cliente...";
    document.getElementById("movFechaVencimiento").value = "";
}

document.getElementById("btnRegistrarMov").addEventListener("click", () => {
    const productoId = document.getElementById("movProducto").value;
    const cantidad = Number(document.getElementById("movCantidad").value);
    const precio = Number(document.getElementById("movPrecio").value);
    if (!productoId) { alert("⚠️ Selecciona un producto."); return; }
    if (!cantidad || cantidad <= 0) { alert("⚠️ La cantidad debe ser mayor a 0."); return; }
    const p = DB.buscarProducto(productoId); if (!p) return;
    if (tipoMovActual === "salida" && !DB.configuracion.ventasSinStock && cantidad > p.cantidad) {
        alert(`⚠️ Stock insuficiente. Disponible: ${p.cantidad} ${p.unidad||""}`); return;
    }

    let nuevaCantidad, costoRealConsumido = null;

    if (p.usaFifo) {
        if (tipoMovActual === "entrada") {
            DB.agregarLote(productoId, cantidad, precio);
        } else {
            const resultado = DB.consumirLotesFIFO(productoId, cantidad);
            costoRealConsumido = resultado.costoUnitarioPromedio;
        }
        nuevaCantidad = DB.buscarProducto(productoId).cantidad;
    } else {
        nuevaCantidad = tipoMovActual === "entrada" ? p.cantidad + cantidad : p.cantidad - cantidad;
        DB.actualizarProducto(productoId, { cantidad: nuevaCantidad });
    }

    const datos = tipoMovActual === "entrada" ? {
        cantidad, precioUnitario: precio,
        proveedor: document.getElementById("movProveedor").value,
        factura: document.getElementById("movFactura").value,
        nota: document.getElementById("movNota").value
    } : {
        cantidad, precioUnitario: precio,
        costoReal: costoRealConsumido,
        motivo: document.getElementById("movMotivo").value,
        metodoPago: document.getElementById("movMetodoPago").value,
        cliente: document.getElementById("movCliente").value,
        clienteId: document.getElementById("movClienteId").value || null,
        fechaVencimiento: document.getElementById("movFechaVencimiento").value || null,
        nota: document.getElementById("movNota").value
    };

    // Validar fiado: si el método es fiado, debe tener cliente seleccionado
    if (datos.metodoPago === "fiado" && !datos.clienteId) {
        alert("⚠️ Selecciona un cliente para registrar una venta a crédito."); return;
    }
    // Verificar límite de crédito antes de registrar
    if (datos.metodoPago === "fiado" && datos.clienteId) {
        const cli = DB.buscarCliente(datos.clienteId);
        if (cli && cli.limiteCredito > 0) {
            const saldoActual = DB.saldoCliente(datos.clienteId);
            const totalVenta = precio * cantidad;
            if (saldoActual + totalVenta > cli.limiteCredito) {
                if (!confirm(`⚠️ Esta venta llevaría a ${cli.nombre} sobre su límite de crédito (${cli.limiteCredito.toLocaleString("es-CU")} CUP). ¿Continuar de todas formas?`)) return;
            }
        }
        // Guardar nombre del cliente para buscabilidad
        if (!datos.cliente) { const cli = DB.buscarCliente(datos.clienteId); if (cli) datos.cliente = cli.nombre; }
    }

    DB.registrarMovimiento(tipoMovActual, productoId, datos);
    // Notificar si el stock queda bajo
    if (tipoMovActual === "salida" && DB.configuracion.notifAlSalida && nuevaCantidad <= p.stockMinimo) {
        enviarNotificacion(`⚠️ Stock bajo: ${p.nombre}`, `Quedan ${nuevaCantidad} ${p.unidad||"unidades"}`);
    }
    let msg = `${tipoMovActual === "entrada" ? "📥" : "📤"} Registrado.\n${p.nombre}: ${cantidad} ${p.unidad||""}\nNuevo stock: ${nuevaCantidad}`;
    if (costoRealConsumido !== null) {
        const moneda = DB.configuracion.moneda || "CUP";
        const gananciaReal = (precio - costoRealConsumido) * cantidad;
        msg += `\nCosto real: ${costoRealConsumido.toLocaleString("es-CU")} ${moneda}/u\nGanancia real: ${gananciaReal.toLocaleString("es-CU")} ${moneda}`;
    }
    alert(msg);
    limpiarFormMov(); actualizarInicio();
});

// ═══════════════════════════════════════════════
// HISTORIAL
// ═══════════════════════════════════════════════
function mostrarHistorial() {
    const lista = document.getElementById("listaHistorial");
    const texto = document.getElementById("buscarHistorial").value.toLowerCase();
    const tipoFiltro = document.getElementById("filtroTipoMov").value;
    const mesFiltro = document.getElementById("filtroMes").value;
    let movimientos = DB.movimientosRecientes(200);
    if (tipoFiltro) movimientos = movimientos.filter(m => m.tipo === tipoFiltro);
    if (mesFiltro) {
        const ahora = new Date();
        movimientos = movimientos.filter(m => {
            const fecha = new Date(m.fecha);
            if (mesFiltro === "hoy") return fecha.toDateString() === ahora.toDateString();
            if (mesFiltro === "semana") { const s = new Date(ahora); s.setDate(ahora.getDate() - 7); return fecha >= s; }
            if (mesFiltro === "mes") return fecha.getMonth() === ahora.getMonth() && fecha.getFullYear() === ahora.getFullYear();
            return true;
        });
    }
    if (texto) movimientos = movimientos.filter(m => { const p = DB.buscarProducto(m.productoId); return p && p.nombre.toLowerCase().includes(texto); });
    document.getElementById("historialSubtitulo").innerText = movimientos.length + " movimientos";
    lista.innerHTML = "";
    if (movimientos.length === 0) { lista.innerHTML = `<p style="text-align:center;color:var(--text2);padding:40px 0;">No hay movimientos registrados.</p>`; return; }
    const motivos = { "venta":"💰 Venta","merma":"📉 Merma","traslado":"🔄 Traslado","devolucion":"↩️ Devolución","consumo":"🍽️ Consumo" };
    const pagos = { "efectivo":"💵 Efectivo","transfermovil":"📱 Transfermóvil","enzona":"💳 EnZona","transferencia":"🏦 Transferencia","fiado":"📦 Fiado" };
    movimientos.forEach(m => {
        if (!m || !m.tipo || !m.id) return;
        const p = DB.buscarProducto(m.productoId);
        const nombre = p ? p.nombre : "Producto eliminado";
        const unidad = p ? (p.unidad || "") : "";
        const fecha = new Date(m.fecha);
        const fechaStr = fecha.toLocaleDateString("es-CU") + " " + fecha.toLocaleTimeString("es-CU", { hour: "2-digit", minute: "2-digit" });
        let detalle = "";
        if (m.tipo === "ajuste") detalle = `🔢 Ajuste: ${m.cantidadAnterior} → ${m.cantidadNueva}`;
        else if (m.tipo === "entrada") detalle = m.proveedor ? `Proveedor: ${m.proveedor}` : m.nota || "Entrada de mercancía";
        else { detalle = motivos[m.motivo] || "Salida"; if (m.metodoPago) detalle += ` · ${pagos[m.metodoPago] || m.metodoPago}`; if (m.cliente) detalle += ` · ${m.cliente}`; }
        const esEntrada = m.tipo === "entrada" || m.tipo === "ajuste";
        const icono = m.tipo === "ajuste" ? "🔢" : esEntrada ? "📥" : "📤";
        const claseIcono = m.tipo === "ajuste" ? "" : esEntrada ? "mov-entrada" : "mov-salida";
        const signo = m.tipo === "ajuste" ? "" : esEntrada ? "+" : "-";
        lista.innerHTML += `
        <div class="mov-card">
            <div class="mov-icono ${claseIcono}" style="${m.tipo==='ajuste'?'background:rgba(245,197,66,0.1)':''}">${icono}</div>
            <div class="mov-info">
                <h4>${nombre} ${m.editado?'<span class="badge-pro">Editado</span>':''}</h4>
                <p>${detalle}</p>
                <p style="font-size:11px;color:var(--text3);margin-top:2px;">${fechaStr}</p>
            </div>
            <div class="mov-cantidad">
                <strong class="${esEntrada?'entrada-text':'salida-text'}">${signo}${m.cantidad} ${unidad}</strong>
                <span>${m.precioUnitario ? m.precioUnitario.toLocaleString("es-CU")+' '+(DB.configuracion.moneda||'CUP')+'/u' : '—'}</span>
                ${(typeof m.costoReal === "number") ? `
                <span class="mov-costo-real">Costo real: ${m.costoReal.toLocaleString("es-CU", {maximumFractionDigits:0})} ${DB.configuracion.moneda||'CUP'}/u</span>
                <span class="mov-ganancia-real">Ganancia: ${((m.precioUnitario - m.costoReal) * m.cantidad).toLocaleString("es-CU", {maximumFractionDigits:0})} ${DB.configuracion.moneda||'CUP'}</span>
                ` : ''}
                ${(p && p.usaFifo) ? '' : `<button onclick="abrirEditarMov('${m.id}')" style="background:none;border:none;color:var(--gold);font-size:14px;cursor:pointer;margin-top:4px;">✏️ <span class="chip-pro">PRO</span></button>`}
            </div>
        </div>`;
    });
}

// ═══════════════════════════════════════════════
// AJUSTE DE STOCK
// ═══════════════════════════════════════════════
function abrirAjuste(id) {
    const p = DB.buscarProducto(id); if (!p) return;
    ajustandoId = id;
    document.getElementById("ajusteNombre").innerText = p.nombre;
    document.getElementById("ajusteStockActual").innerText = `${p.cantidad} ${p.unidad||""}`;
    document.getElementById("ajusteCantidad").value = "";
    document.getElementById("ajusteNota").value = "";
    document.getElementById("ajusteTipo").value = "cantidad_real";
    document.getElementById("ajusteMotivo").value = "conteo";
    document.getElementById("modalAjuste").classList.remove("oculto");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
}

function cerrarAjuste() {
    document.getElementById("modalAjuste").classList.add("oculto");
    document.getElementById("btnFlotante").classList.remove("ocultar-boton");
    ajustandoId = null;
}

document.getElementById("btnConfirmarAjuste").addEventListener("click", () => {
    if (!ajustandoId) return;
    const p = DB.buscarProducto(ajustandoId); if (!p) return;
    const tipo = document.getElementById("ajusteTipo").value;
    const cantidad = Number(document.getElementById("ajusteCantidad").value);
    const motivo = document.getElementById("ajusteMotivo").value;
    const nota = document.getElementById("ajusteNota").value;
    if (isNaN(cantidad) || cantidad < 0) { alert("⚠️ Ingresa una cantidad válida."); return; }

    let nuevaCantidad, descripcion, diferencia;
    if (tipo === "cantidad_real") { diferencia = cantidad - p.cantidad; descripcion = `Conteo: ${p.cantidad} → ${cantidad}`; }
    else if (tipo === "agregar") { diferencia = cantidad; descripcion = `Ajuste +${cantidad}`; }
    else {
        if (cantidad > p.cantidad) { alert(`⚠️ No puedes restar más del stock (${p.cantidad}).`); return; }
        diferencia = -cantidad; descripcion = `Ajuste -${cantidad}`;
    }

    if (p.usaFifo) {
        const costoLoteViejo = (p.lotes && p.lotes.length > 0) ? p.lotes[0].costo : (p.compra || 0);
        if (diferencia > 0) DB.agregarLote(ajustandoId, diferencia, costoLoteViejo);
        else if (diferencia < 0) DB.consumirLotesFIFO(ajustandoId, Math.abs(diferencia));
        nuevaCantidad = DB.buscarProducto(ajustandoId).cantidad;
    } else {
        nuevaCantidad = p.cantidad + diferencia;
        DB.actualizarProducto(ajustandoId, { cantidad: nuevaCantidad });
    }

    DB.registrarMovimiento("ajuste", ajustandoId, { cantidad: Math.abs(diferencia), cantidadAnterior: p.cantidad, cantidadNueva: nuevaCantidad, motivo, nota: nota || descripcion });
    alert(`✅ Stock actualizado.\n${p.nombre}: ${p.cantidad} → ${nuevaCantidad} ${p.unidad||""}`);
    cerrarAjuste(); mostrarInventario(); actualizarInicio();
});

// ═══════════════════════════════════════════════
// EDITAR MOVIMIENTO PRO
// ═══════════════════════════════════════════════
function abrirEditarMov(movId) {
    const mov = DB.movimientos.find(m => m.id === movId); if (!mov) return;
    const p = DB.buscarProducto(mov.productoId); if (!p) return;
    if (p.usaFifo) {
        alert("⚠️ Este producto usa control de lotes (FIFO). Editar movimientos antiguos podría descuadrar los costos reales, así que está desactivado para estos productos.\n\nSi necesitas corregir el stock, usa un Ajuste en su lugar.");
        return;
    }
    editandoMovId = movId;
    document.getElementById("editMovNombre").innerText = p.nombre;
    document.getElementById("editMovTipo").innerText = mov.tipo === "entrada" ? "📥 Entrada" : "📤 Salida";
    document.getElementById("editMovCantidad").value = mov.cantidad;
    document.getElementById("editMovPrecio").value = mov.precioUnitario || "";
    document.getElementById("editMovContacto").value = mov.proveedor || mov.cliente || "";
    document.getElementById("editMovNota").value = mov.nota || "";
    document.getElementById("modalEditarMov").classList.remove("oculto");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
}

function cerrarEditarMov() {
    document.getElementById("modalEditarMov").classList.add("oculto");
    document.getElementById("btnFlotante").classList.remove("ocultar-boton");
    editandoMovId = null;
}

document.getElementById("btnConfirmarEditMov").addEventListener("click", () => {
    if (!editandoMovId) return;
    const mov = DB.movimientos.find(m => m.id === editandoMovId); if (!mov) return;
    const p = DB.buscarProducto(mov.productoId); if (!p) return;
    const cantidadAnterior = mov.cantidad;
    const cantidadNueva = Number(document.getElementById("editMovCantidad").value);
    const precio = Number(document.getElementById("editMovPrecio").value);
    const contacto = document.getElementById("editMovContacto").value;
    const nota = document.getElementById("editMovNota").value;
    if (!cantidadNueva || cantidadNueva <= 0) { alert("⚠️ La cantidad debe ser mayor a 0."); return; }
    const diferencia = cantidadNueva - cantidadAnterior;
    let nuevaCantidad = mov.tipo === "entrada" ? p.cantidad + diferencia : p.cantidad - diferencia;
    if (nuevaCantidad < 0) { alert("⚠️ Este cambio dejaría el stock en negativo."); return; }
    mov.cantidad = cantidadNueva; mov.precioUnitario = precio; mov.nota = nota;
    mov.editado = true; mov.fechaEdicion = new Date().toISOString();
    if (mov.tipo === "entrada") mov.proveedor = contacto; else mov.cliente = contacto;
    DB.actualizarProducto(mov.productoId, { cantidad: nuevaCantidad });
    DB.guardar();
    alert(`✅ Movimiento actualizado.\nStock: ${p.cantidad} → ${nuevaCantidad} ${p.unidad||""}`);
    cerrarEditarMov(); mostrarHistorial(); actualizarInicio();
});

// ═══════════════════════════════════════════════
// CONFIGURACIÓN — SUBPANTALLAS
// ═══════════════════════════════════════════════
function cargarSubConfig(sub) {
    const cfg = DB.configuracion;
    if (sub === "negocio") {
        document.getElementById("subEmoji").value = cfg.emoji || "🏪";
        document.getElementById("subEmojiPreview").innerText = cfg.emoji || "🏪";
        document.getElementById("subNombreNegocio").value = cfg.nombreNegocio || "";
        document.getElementById("subPropietario").value = cfg.propietario || "";
        document.getElementById("subTelefono").value = cfg.telefono || "";
        document.getElementById("subDireccion").value = cfg.direccion || "";
        document.getElementById("subMunicipio").value = cfg.municipio || "";
        document.getElementById("subProvincia").value = cfg.provincia || "";
        document.getElementById("subMoneda").value = cfg.moneda || "CUP";
        document.getElementById("subPiePagina").value = cfg.piePagina || "";
        // Construir scroll de emojis
        const scroll = document.getElementById("subEmojiScroll");
        scroll.innerHTML = EMOJIS_NEGOCIO.map(e => `
            <button class="sub-emoji-btn ${e === (cfg.emoji||'🏪') ? 'activo' : ''}"
                onclick="seleccionarSubEmoji('${e}')">${e}</button>`).join("");
    }
    else if (sub === "inventario") {
        document.getElementById("subStockMinimo").value = cfg.stockMinimo || 5;
        document.getElementById("subAlertasStock").checked = cfg.alertasStock !== false;
        document.getElementById("subMostrarAgotados").checked = cfg.mostrarAgotados !== false;
        document.getElementById("subAlertaVencimiento").checked = cfg.alertaVencimiento !== false;
        document.getElementById("subVistaLista").checked = cfg.vistaLista === true;
        document.getElementById("subAgruparCategoria").checked = cfg.agruparCategoria === true;
    }
    else if (sub === "ventas") {
        document.getElementById("subMetodoPago").value = cfg.metodoPagoDefault || "efectivo";
        document.getElementById("subVentasSinStock").checked = cfg.ventasSinStock === true;
        document.getElementById("subSolicitarCliente").checked = cfg.solicitarCliente === true;
        document.getElementById("subNumAuto").checked = cfg.numAuto !== false;
        document.getElementById("subProxFactura").value = cfg.proxFactura || 1;
    }
    else if (sub === "onat") {
        document.getElementById("subRegimen").value = cfg.regimenFiscal || "TCP";
        document.getElementById("subNumONAT").value = cfg.numONAT || "";
        document.getElementById("subActividad").value = cfg.actividad || "";
        document.getElementById("subImpuestoAuto").checked = cfg.impuestoAuto === true;
        document.getElementById("subPorcentajeImpuesto").value = cfg.porcentajeImpuesto || 10;
    }
    else if (sub === "notificaciones") {
        document.getElementById("subNotifStockBajo").checked = cfg.notifStockBajo !== false;
        document.getElementById("subNotifAlSalida").checked = cfg.notifAlSalida !== false;
        document.getElementById("subNotifVencimiento").checked = cfg.notifVencimiento !== false;
        document.getElementById("subDiasVencimiento").value = cfg.diasVencimiento || 7;
    }
    else if (sub === "seguridad") {
        document.getElementById("subPinActivo").checked = cfg.pinActivo === true;
        document.getElementById("subBloqueoAuto").value = cfg.bloqueoAuto || 0;
        document.getElementById("subOcultarCompra").checked = cfg.ocultarCompra === true;
        if (cfg.pinActivo) document.getElementById("subPinCampos").classList.remove("oculto");
    }
    else if (sub === "respaldo") {
        document.getElementById("subUltimoRespaldo").innerText = cfg.ultimoRespaldo
            ? new Date(cfg.ultimoRespaldo).toLocaleString("es-CU") : "Nunca";
    }
    else if (sub === "apariencia") {
        document.getElementById("subTamanoTexto").value = cfg.tamanoTexto || "normal";
        document.getElementById("subAnimaciones").checked = cfg.animaciones !== false;
        document.getElementById("subGlow").checked = cfg.glow !== false;
    }
    else if (sub === "idioma") {
        document.getElementById("subFormatoFecha").value = cfg.formatoFecha || "dd/mm/yyyy";
        document.getElementById("subSeparadorDecimal").value = cfg.separadorDecimal || "punto";
    }
}

function seleccionarSubEmoji(emoji) {
    document.getElementById("subEmoji").value = emoji;
    document.getElementById("subEmojiPreview").innerText = emoji;
    document.querySelectorAll(".sub-emoji-btn").forEach(b => b.classList.remove("activo"));
    document.querySelectorAll(".sub-emoji-btn").forEach(b => { if (b.innerText === emoji) b.classList.add("activo"); });
}

function toggleSubPin() {
    const activo = document.getElementById("subPinActivo").checked;
    document.getElementById("subPinCampos").classList.toggle("oculto", !activo);
}

function seleccionarTema(tema) { /* Tema claro próximamente */ }

// Guardar cada subpantalla
function guardarNegocio() {
    DB.configuracion = {
        ...DB.configuracion,
        emoji: document.getElementById("subEmoji").value || "🏪",
        nombreNegocio: document.getElementById("subNombreNegocio").value.trim() || "Mi Negocio",
        propietario: document.getElementById("subPropietario").value.trim(),
        telefono: document.getElementById("subTelefono").value.trim(),
        direccion: document.getElementById("subDireccion").value.trim(),
        municipio: document.getElementById("subMunicipio").value.trim(),
        provincia: document.getElementById("subProvincia").value,
        moneda: document.getElementById("subMoneda").value,
        piePagina: document.getElementById("subPiePagina").value.trim()
    };
    DB.guardar(); actualizarInicio();
    mostrarToast("✅ Negocio guardado");
    volverConfig();
}

function guardarInventario() {
    DB.configuracion = {
        ...DB.configuracion,
        stockMinimo: Number(document.getElementById("subStockMinimo").value) || 5,
        alertasStock: document.getElementById("subAlertasStock").checked,
        mostrarAgotados: document.getElementById("subMostrarAgotados").checked,
        alertaVencimiento: document.getElementById("subAlertaVencimiento").checked,
        vistaLista: document.getElementById("subVistaLista").checked,
        agruparCategoria: document.getElementById("subAgruparCategoria").checked
    };
    DB.guardar();
    mostrarToast("✅ Inventario guardado");
    volverConfig();
}

function guardarVentas() {
    DB.configuracion = {
        ...DB.configuracion,
        metodoPagoDefault: document.getElementById("subMetodoPago").value,
        ventasSinStock: document.getElementById("subVentasSinStock").checked,
        solicitarCliente: document.getElementById("subSolicitarCliente").checked,
        numAuto: document.getElementById("subNumAuto").checked,
        proxFactura: Number(document.getElementById("subProxFactura").value) || 1
    };
    DB.guardar();
    mostrarToast("✅ Ventas guardado");
    volverConfig();
}

function guardarOnat() {
    DB.configuracion = {
        ...DB.configuracion,
        regimenFiscal: document.getElementById("subRegimen").value,
        numONAT: document.getElementById("subNumONAT").value.trim(),
        actividad: document.getElementById("subActividad").value.trim(),
        impuestoAuto: document.getElementById("subImpuestoAuto").checked,
        porcentajeImpuesto: Number(document.getElementById("subPorcentajeImpuesto").value) || 10
    };
    DB.guardar();
    mostrarToast("✅ ONAT guardado");
    volverConfig();
}

function guardarNotificaciones() {
    DB.configuracion = {
        ...DB.configuracion,
        notifStockBajo: document.getElementById("subNotifStockBajo").checked,
        notifAlSalida: document.getElementById("subNotifAlSalida").checked,
        notifVencimiento: document.getElementById("subNotifVencimiento").checked,
        diasVencimiento: Number(document.getElementById("subDiasVencimiento").value) || 7
    };
    DB.guardar();
    mostrarToast("✅ Notificaciones guardadas");
    volverConfig();
}

function guardarSeguridad() {
    const pinActivo = document.getElementById("subPinActivo").checked;
    let pin = DB.configuracion.pin;
    if (pinActivo) {
        const pinNuevo = document.getElementById("subPin").value;
        const pinConfirm = document.getElementById("subPinConfirm").value;
        if (pinNuevo) {
            if (pinNuevo.length !== 4 || !/^\d{4}$/.test(pinNuevo)) { alert("⚠️ El PIN debe tener exactamente 4 dígitos."); return; }
            if (pinNuevo !== pinConfirm) { alert("⚠️ Los PIN no coinciden."); return; }
            pin = pinNuevo;
        } else if (!pin) { alert("⚠️ Debes establecer un PIN de 4 dígitos."); return; }
    }
    DB.configuracion = {
        ...DB.configuracion,
        pinActivo, pin,
        bloqueoAuto: Number(document.getElementById("subBloqueoAuto").value) || 0,
        ocultarCompra: document.getElementById("subOcultarCompra").checked
    };
    DB.guardar();
    mostrarToast("✅ Seguridad guardada");
    volverConfig();
}

function guardarApariencia() {
    DB.configuracion = {
        ...DB.configuracion,
        tamanoTexto: document.getElementById("subTamanoTexto").value,
        animaciones: document.getElementById("subAnimaciones").checked,
        glow: document.getElementById("subGlow").checked
    };
    DB.guardar();
    aplicarConfiguracion();
    mostrarToast("✅ Apariencia guardada");
    volverConfig();
}

function guardarIdioma() {
    DB.configuracion = {
        ...DB.configuracion,
        formatoFecha: document.getElementById("subFormatoFecha").value,
        separadorDecimal: document.getElementById("subSeparadorDecimal").value
    };
    DB.guardar();
    mostrarToast("✅ Idioma guardado");
    volverConfig();
}

// ═══════════════════════════════════════════════
// TOAST (feedback visual rápido)
// ═══════════════════════════════════════════════
function mostrarToast(mensaje) {
    let toast = document.getElementById("toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast";
        document.body.appendChild(toast);
    }
    toast.innerText = mensaje;
    toast.className = "toast-visible";
    setTimeout(() => { toast.className = ""; }, 2500);
}

// ═══════════════════════════════════════════════
// NOTIFICACIONES
// ═══════════════════════════════════════════════
async function solicitarPermisoNotificaciones() {
    if (!("Notification" in window)) { alert("⚠️ Tu navegador no soporta notificaciones."); return; }
    const permiso = await Notification.requestPermission();
    if (permiso === "granted") { mostrarToast("✅ Notificaciones activadas"); }
    else { alert("⚠️ Permiso denegado. Actívalo en la configuración del navegador."); }
}

function enviarNotificacion(titulo, cuerpo) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    new Notification(titulo, { body: cuerpo, icon: "" });
}

function probarNotificacion() {
    if (Notification.permission !== "granted") {
        alert("⚠️ Primero activa las notificaciones arriba.");
        return;
    }
    enviarNotificacion("🧪 INVENTARY ARB", "Las notificaciones funcionan correctamente.");
    mostrarToast("✅ Notificación enviada");
}

function verificarStockAlIniciar() {
    if (!DB.configuracion.notifStockBajo) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const bajos = DB.productos.filter(p => p.cantidad <= p.stockMinimo && p.stockMinimo > 0);
    if (bajos.length > 0) {
        const nombres = bajos.slice(0, 3).map(p => p.nombre).join(", ");
        enviarNotificacion(`⚠️ ${bajos.length} producto(s) con stock bajo`, nombres);
    }
    // Verificar vencimientos
    if (DB.configuracion.notifVencimiento) {
        const dias = DB.configuracion.diasVencimiento || 7;
        const limite = new Date(); limite.setDate(limite.getDate() + dias);
        const porVencer = DB.productos.filter(p => {
            if (!p.vencimiento) return false;
            const fv = new Date(p.vencimiento);
            return fv <= limite && fv >= new Date();
        });
        if (porVencer.length > 0) {
            enviarNotificacion(`📅 ${porVencer.length} producto(s) por vencer`, porVencer.slice(0,2).map(p => p.nombre).join(", "));
        }
    }
}

// ═══════════════════════════════════════════════
// RESPALDO Y RESTAURACIÓN
// ═══════════════════════════════════════════════
function exportarRespaldo() {
    const respaldo = {
        version: "1.0.0", fecha: new Date().toISOString(),
        negocio: DB.configuracion.nombreNegocio || "Mi Negocio",
        productos: DB.productos, movimientos: DB.movimientos,
        almacenes: DB.almacenes, configuracion: DB.configuracion
    };
    DB.configuracion.ultimoRespaldo = respaldo.fecha;
    DB.guardar();
    const el = document.getElementById("subUltimoRespaldo");
    if (el) el.innerText = new Date(respaldo.fecha).toLocaleString("es-CU");
    const blob = new Blob([JSON.stringify(respaldo, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventary-arb-respaldo-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarToast("✅ Respaldo exportado");
}

function importarRespaldo(e) {
    const archivo = e.target.files[0]; if (!archivo) return;
    if (!confirm("⚠️ Esto reemplazará TODOS los datos actuales. ¿Continuar?")) { e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const datos = JSON.parse(ev.target.result);
            if (!datos.productos || !datos.movimientos) { alert("⚠️ Archivo de respaldo inválido."); return; }
            DB.productos = datos.productos || [];
            DB.movimientos = datos.movimientos || [];
            DB.almacenes = datos.almacenes || DB.almacenes;
            DB.configuracion = { ...DB.configuracion, ...datos.configuracion };
            DB.guardar();
            aplicarConfiguracion();
            alert(`✅ Datos restaurados.\n${DB.productos.length} productos\n${DB.movimientos.length} movimientos`);
            actualizarInicio();
            volverConfig();
        } catch { alert("⚠️ Error al leer el archivo."); }
    };
    reader.readAsText(archivo);
    e.target.value = "";
}

function confirmarBorrarSoloProductos() {
    if (!confirm("⚠️ Esto eliminará todos los productos y movimientos (tus pruebas), pero mantiene tu configuración del negocio y los almacenes. ¿Continuar?")) return;
    DB.productos = [];
    DB.movimientos = [];
    DB.guardar();
    alert("✅ Productos y movimientos eliminados. Tu configuración y almacenes se mantienen.");
    actualizarInicio();
    location.reload();
}

function confirmarBorrarDatos() {
    if (!confirm("⚠️ ADVERTENCIA: Esto eliminará TODOS los productos, movimientos y configuración. Esta acción NO se puede deshacer.\n\n¿Estás completamente seguro?")) return;
    if (!confirm("⚠️ Última confirmación: ¿Borrar todo permanentemente?")) return;
    localStorage.clear();
    alert("✅ Todos los datos eliminados.");
    location.reload();
}

// ═══════════════════════════════════════════════
// PIN DE ACCESO
// ═══════════════════════════════════════════════
function mostrarModalPin() {
    pinIngresado = "";
    actualizarDisplayPin();
    document.getElementById("modalPin").classList.remove("oculto");
    document.getElementById("pinError").style.display = "none";
}

function pinTecla(digito) {
    if (pinIngresado.length >= 4) return;
    pinIngresado += digito;
    actualizarDisplayPin();
    if (pinIngresado.length === 4) {
        setTimeout(() => {
            if (pinIngresado === DB.configuracion.pin) {
                document.getElementById("modalPin").classList.add("oculto");
                actualizarInicio();
                verificarStockAlIniciar();
            } else {
                document.getElementById("pinError").style.display = "block";
                pinIngresado = "";
                actualizarDisplayPin();
            }
        }, 200);
    }
}

function pinBorrar() {
    if (pinIngresado.length === 0) return;
    pinIngresado = pinIngresado.slice(0, -1);
    actualizarDisplayPin();
}

function actualizarDisplayPin() {
    for (let i = 1; i <= 4; i++) {
        const dot = document.getElementById("pd" + i);
        if (dot) dot.classList.toggle("activo", i <= pinIngresado.length);
    }
}

// ═══════════════════════════════════════════════
// MÓDULO ALMACENES
// ═══════════════════════════════════════════════
const EMOJIS_ALMACEN = ["🏪","📦","🚚","🏬","🏭","🛒","🏠","🗄️","🚛","🏗️"];

function estadisticasAlmacen(nombreAlmacen) {
    const productos = DB.productos.filter(p => p.almacen === nombreAlmacen);
    let valor = 0, valorVenta = 0, stockBajo = 0;
    productos.forEach(p => {
        valor += (p.compra || 0) * (p.cantidad || 0);
        valorVenta += (p.venta || 0) * (p.cantidad || 0);
        if (p.cantidad <= p.stockMinimo) stockBajo++;
    });
    return { productos, total: productos.length, valor, valorVenta, ganancia: valorVenta - valor, stockBajo };
}

function mostrarAlmacenes() {
    const lista = document.getElementById("listaAlmacenes");
    const texto = (document.getElementById("buscarAlmacen").value || "").toLowerCase();
    document.getElementById("menuTotalAlmacenes").innerText = DB.almacenes.length + " almacén" + (DB.almacenes.length !== 1 ? "es" : "");

    let almacenes = DB.almacenes.filter(a => a.nombre.toLowerCase().includes(texto));

    if (almacenes.length === 0) {
        lista.innerHTML = `<p style="text-align:center;color:var(--text2);padding:40px 0;">No hay almacenes. Toca ＋ para crear uno.</p>`;
        return;
    }

    lista.innerHTML = almacenes.map(a => {
        const est = estadisticasAlmacen(a.nombre);
        const moneda = DB.configuracion.moneda || "CUP";
        const alertaHtml = est.stockBajo > 0
            ? `<span class="alm-card-alerta">⚠️ ${est.stockBajo} stock bajo${est.stockBajo > 1 ? 's' : ''}</span>`
            : `<span class="alm-card-ok">✅ Sin alertas</span>`;
        const inactivoTag = a.activo === false ? `<span class="alm-card-inactivo">Inactivo</span>` : "";
        return `
        <div class="alm-card" onclick="abrirAlmacenDetalle('${a.id}')">
            <div class="alm-card-header">
                <span class="alm-card-emoji">${a.emoji || "🏪"}</span>
                <span class="alm-card-nombre">${a.nombre}</span>
                ${inactivoTag}
            </div>
            <div class="alm-card-stats">
                <span>📦 ${est.total} producto${est.total !== 1 ? 's' : ''}</span>
                <span>💰 ${est.valor.toLocaleString("es-CU")} ${moneda}</span>
            </div>
            ${alertaHtml}
        </div>`;
    }).join("");
}

function seleccionarAlmEmoji(emoji) {
    document.getElementById("almEmoji").value = emoji;
    document.getElementById("almEmojiPreview").innerText = emoji;
    document.querySelectorAll(".alm-emoji-btn").forEach(b => b.classList.remove("activo"));
    document.querySelectorAll(".alm-emoji-btn").forEach(b => { if (b.innerText === emoji) b.classList.add("activo"); });
}

function abrirModalAlmacen(id) {
    const scroll = document.getElementById("almEmojiScroll");
    scroll.innerHTML = EMOJIS_ALMACEN.map(e => `
        <button class="alm-emoji-btn" onclick="seleccionarAlmEmoji('${e}')">${e}</button>`).join("");
    scroll.querySelectorAll(".alm-emoji-btn").forEach(b => b.classList.add("sub-emoji-btn"));

    if (id) {
        const a = DB.almacenes.find(al => al.id === id);
        if (!a) return;
        editandoAlmacenId = id;
        document.getElementById("modalAlmacenTitulo").innerText = "✏️ Editar Almacén";
        document.getElementById("almNombre").value = a.nombre || "";
        document.getElementById("almEmoji").value = a.emoji || "🏪";
        document.getElementById("almEmojiPreview").innerText = a.emoji || "🏪";
        document.getElementById("almResponsable").value = a.responsable || "";
        document.getElementById("almDireccion").value = a.direccion || "";
        document.getElementById("almPermiteVentas").checked = a.permiteVentas !== false;
        document.getElementById("almPermiteTransferencias").checked = a.permiteTransferencias !== false;
        document.getElementById("almActivo").checked = a.activo !== false;
        seleccionarAlmEmoji(a.emoji || "🏪");
    } else {
        editandoAlmacenId = null;
        document.getElementById("modalAlmacenTitulo").innerText = "🏪 Nuevo Almacén";
        document.getElementById("almNombre").value = "";
        document.getElementById("almEmoji").value = "🏪";
        document.getElementById("almEmojiPreview").innerText = "🏪";
        document.getElementById("almResponsable").value = "";
        document.getElementById("almDireccion").value = "";
        document.getElementById("almPermiteVentas").checked = true;
        document.getElementById("almPermiteTransferencias").checked = true;
        document.getElementById("almActivo").checked = true;
        seleccionarAlmEmoji("🏪");
    }
    document.getElementById("modalAlmacen").classList.remove("oculto");
}

function cerrarModalAlmacen() {
    document.getElementById("modalAlmacen").classList.add("oculto");
    editandoAlmacenId = null;
}

document.getElementById("btnGuardarAlmacen").addEventListener("click", () => {
    const nombre = document.getElementById("almNombre").value.trim();
    if (!nombre) { alert("⚠️ El nombre del almacén es obligatorio."); return; }

    const datos = {
        nombre,
        emoji: document.getElementById("almEmoji").value || "🏪",
        responsable: document.getElementById("almResponsable").value.trim(),
        direccion: document.getElementById("almDireccion").value.trim(),
        permiteVentas: document.getElementById("almPermiteVentas").checked,
        permiteTransferencias: document.getElementById("almPermiteTransferencias").checked,
        activo: document.getElementById("almActivo").checked
    };

    if (editandoAlmacenId) {
        const idx = DB.almacenes.findIndex(a => a.id === editandoAlmacenId);
        if (idx !== -1) {
            const nombreAnterior = DB.almacenes[idx].nombre;
            DB.almacenes[idx] = { ...DB.almacenes[idx], ...datos };
            // Si el nombre cambió, actualizar productos que referencian el almacén anterior
            if (nombreAnterior !== nombre) {
                DB.productos.forEach(p => { if (p.almacen === nombreAnterior) p.almacen = nombre; });
            }
        }
        mostrarToast("✅ Almacén actualizado");
    } else {
        const nuevo = { id: "alm_" + Date.now(), ...datos };
        DB.almacenes.push(nuevo);
        mostrarToast("✅ Almacén creado");
    }
    DB.guardar();
    cerrarModalAlmacen();
    mostrarAlmacenes();
    actualizarInicio();
});

function abrirAlmacenDetalle(id) {
    const a = DB.almacenes.find(al => al.id === id);
    if (!a) return;
    almacenActualId = id;
    filtroHistorialAlmacen = "todo";
    filtroTipoHistorialAlmacen = "todo";
    mostrarPantalla("pantallaAlmacenDetalle");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    cambiarTabAlmacen("productos");
    actualizarDashboardAlmacen();
}

function actualizarDashboardAlmacen() {
    const a = DB.almacenes.find(al => al.id === almacenActualId);
    if (!a) return;
    const est = estadisticasAlmacen(a.nombre);
    const moneda = DB.configuracion.moneda || "CUP";
    document.getElementById("almDetTitulo").innerText = `${a.emoji || "🏪"} ${a.nombre}`;
    document.getElementById("almDetSub").innerText = est.total + " productos";
    document.getElementById("almStatProductos").innerText = est.total;
    document.getElementById("almStatAlertas").innerText = est.stockBajo;
    document.getElementById("almStatValor").innerText = est.valor.toLocaleString("es-CU");
    document.getElementById("almStatValorVenta").innerText = est.valorVenta.toLocaleString("es-CU");
    document.getElementById("almStatGanancia").innerText = est.ganancia.toLocaleString("es-CU");
    mostrarProductosAlmacen();
}

function cambiarTabAlmacen(tab) {
    tabAlmacenActual = tab;
    ["productos", "movimientos", "estadisticas", "ajustes"].forEach(t => {
        document.getElementById("almTab" + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle("activo", t === tab);
        document.getElementById("almContenido" + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle("oculto", t !== tab);
    });
    if (tab === "productos") mostrarProductosAlmacen();
    if (tab === "movimientos") mostrarHistorialAlmacen();
    if (tab === "estadisticas") mostrarEstadisticasAlmacen();
    if (tab === "ajustes") mostrarAjustesAlmacen();
}

function mostrarProductosAlmacen() {
    const a = DB.almacenes.find(al => al.id === almacenActualId);
    if (!a) return;
    const texto = (document.getElementById("buscarProductoAlmacen").value || "").toLowerCase();
    const lista = document.getElementById("listaProductosAlmacen");
    const moneda = DB.configuracion.moneda || "CUP";
    const ocultarCompra = DB.configuracion.ocultarCompra;

    let productos = DB.productos.filter(p => p.almacen === a.nombre);
    if (texto) productos = productos.filter(p => p.nombre.toLowerCase().includes(texto));
    productos.sort((x, y) => x.nombre.localeCompare(y.nombre));

    if (productos.length === 0) {
        lista.innerHTML = `<p style="text-align:center;color:var(--text2);padding:30px 0;">No hay productos en este almacén.</p>`;
        return;
    }

    lista.innerHTML = productos.map(p => {
        const bajo = p.cantidad <= p.stockMinimo;
        return `
        <div class="producto-fila ${bajo ? 'stock-bajo' : ''}" onclick="abrirSheetAcciones('${p.id}')">
            <div class="info-fila">
                <h3>${ICONOS[p.categoria] || "📦"} ${p.nombre}${bajo ? '<span class="badge-stock">⚠️</span>' : ''}</h3>
                <span>Stock: ${p.cantidad} ${p.unidad || ""}</span>
            </div>
            <div class="precios-fila">
                <div class="pv">${(p.venta||0).toLocaleString("es-CU")} ${moneda}</div>
                ${!ocultarCompra ? `<div class="pc">${(p.compra||0).toLocaleString("es-CU")} ${moneda}</div>` : ''}
            </div>
            <div class="fila-accion-hint">›</div>
        </div>`;
    }).join("");
}

function confirmarEliminarAlmacen() {
    const a = DB.almacenes.find(al => al.id === almacenActualId);
    if (!a) return;
    const enUso = DB.productos.filter(p => p.almacen === a.nombre).length;
    if (enUso > 0) {
        alert(`⚠️ No puedes eliminar "${a.nombre}" porque tiene ${enUso} producto(s) asignados. Mueve o elimina esos productos primero.`);
        return;
    }
    if (!confirm(`¿Eliminar el almacén "${a.nombre}"? Esta acción no se puede deshacer.`)) return;
    DB.almacenes = DB.almacenes.filter(al => al.id !== almacenActualId);
    DB.guardar();
    mostrarToast("✅ Almacén eliminado");
    volverAlmacenes();
}

// ═══════════════════════════════════════════════
// TRANSFERENCIAS ENTRE ALMACENES
// ═══════════════════════════════════════════════
let productoTransfSeleccionado = null;

function abrirModalTransferencia() {
    const a = DB.almacenes.find(al => al.id === almacenActualId);
    if (!a) return;
    if (a.permiteTransferencias === false) {
        alert("⚠️ Este almacén tiene las transferencias desactivadas. Actívalas en Ajustes.");
        return;
    }
    const otros = DB.almacenes.filter(al => al.id !== almacenActualId && al.activo !== false);
    if (otros.length === 0) {
        alert("⚠️ Necesitas al menos otro almacén activo para transferir.");
        return;
    }
    productoTransfSeleccionado = null;
    document.getElementById("transfDesde").innerText = `${a.emoji || "🏪"} ${a.nombre}`;
    document.getElementById("transfProducto").value = "";
    document.getElementById("textoProductoTransf").className = "texto-prod-placeholder";
    document.getElementById("textoProductoTransf").innerText = "Toca para buscar un producto...";
    document.getElementById("transfInfoProducto").classList.add("oculto");
    document.getElementById("transfCantidad").value = "";
    document.getElementById("transfNota").value = "";
    const select = document.getElementById("transfHacia");
    select.innerHTML = `<option value="">— Seleccionar almacén —</option>` +
        otros.map(al => `<option value="${al.id}">${al.emoji || "🏪"} ${al.nombre}</option>`).join("");
    document.getElementById("modalTransferencia").classList.remove("oculto");
}

function cerrarModalTransferencia() {
    document.getElementById("modalTransferencia").classList.add("oculto");
}

function seleccionarProductoTransferencia(id) {
    const p = DB.buscarProducto(id); if (!p) return;
    productoTransfSeleccionado = p;
    document.getElementById("transfProducto").value = p.id;
    const textoEl = document.getElementById("textoProductoTransf");
    textoEl.className = "texto-prod-seleccionado";
    textoEl.innerText = `${ICONOS[p.categoria]||"📦"} ${p.nombre}`;
    document.getElementById("transfStockDisponible").innerText = `${p.cantidad} ${p.unidad||""}`;
    document.getElementById("transfInfoProducto").classList.remove("oculto");
    cerrarSheetProductos();
}

document.getElementById("btnConfirmarTransferencia").addEventListener("click", () => {
    const origen = DB.almacenes.find(al => al.id === almacenActualId);
    if (!origen) return;
    const productoId = document.getElementById("transfProducto").value;
    const destinoId = document.getElementById("transfHacia").value;
    const cantidad = Number(document.getElementById("transfCantidad").value);
    const nota = document.getElementById("transfNota").value;

    if (!productoId) { alert("⚠️ Selecciona un producto."); return; }
    if (!destinoId) { alert("⚠️ Selecciona el almacén de destino."); return; }
    if (!cantidad || cantidad <= 0) { alert("⚠️ La cantidad debe ser mayor a 0."); return; }

    const p = DB.buscarProducto(productoId); if (!p) return;
    if (cantidad > p.cantidad) { alert(`⚠️ Stock insuficiente. Disponible: ${p.cantidad} ${p.unidad||""}`); return; }

    const destino = DB.almacenes.find(al => al.id === destinoId);
    if (!destino) return;

    // Buscar si ya existe el mismo producto (por nombre) en el almacén destino
    let productoDestino = DB.productos.find(dp => dp.nombre === p.nombre && dp.almacen === destino.nombre);
    if (!productoDestino) {
        const { id, fechaCreacion, lotes, ...datosBase } = p;
        productoDestino = DB.agregarProducto({ ...datosBase, cantidad: 0, almacen: destino.nombre, usaFifo: p.usaFifo, lotes: [] });
    }

    if (p.usaFifo) {
        // Mover los lotes exactos (con su costo original) del origen al destino
        const resultado = DB.consumirLotesFIFO(productoId, cantidad);
        resultado.detalle.forEach(lote => {
            DB.agregarLote(productoDestino.id, lote.cantidad, lote.costo);
        });
    } else {
        DB.actualizarProducto(productoId, { cantidad: p.cantidad - cantidad });
        DB.actualizarProducto(productoDestino.id, { cantidad: productoDestino.cantidad + cantidad });
    }

    // Registrar el movimiento de transferencia (un solo registro con origen y destino)
    DB.registrarMovimiento("transferencia", productoId, {
        cantidad, origen: origen.nombre, destino: destino.nombre,
        nota: nota || `${origen.nombre} → ${destino.nombre}`
    });

    mostrarToast(`✅ ${cantidad} ${p.unidad||"unidades"} transferidas a ${destino.nombre}`);
    cerrarModalTransferencia();
    actualizarDashboardAlmacen();
    actualizarInicio();
});

// ═══════════════════════════════════════════════
// HISTORIAL FILTRADO POR ALMACÉN
// ═══════════════════════════════════════════════
let filtroHistorialAlmacen = "todo";
let filtroTipoHistorialAlmacen = "todo";

function filtrarHistorialAlmacen(btn) {
    btn.parentElement.querySelectorAll(".chip-filtro").forEach(c => c.classList.remove("activo"));
    btn.classList.add("activo");
    filtroHistorialAlmacen = btn.dataset.filtro;
    mostrarHistorialAlmacen();
}

function filtrarTipoHistorialAlmacen(btn) {
    btn.parentElement.querySelectorAll(".chip-filtro").forEach(c => c.classList.remove("activo"));
    btn.classList.add("activo");
    filtroTipoHistorialAlmacen = btn.dataset.tipo;
    mostrarHistorialAlmacen();
}

function mostrarHistorialAlmacen() {
    const a = DB.almacenes.find(al => al.id === almacenActualId);
    if (!a) return;
    const lista = document.getElementById("listaHistorialAlmacen");
    if (!lista) return;

    // Productos actuales e históricos que pertenecen (o pertenecieron) a este almacén
    const idsProductosAlmacen = new Set(DB.productos.filter(p => p.almacen === a.nombre).map(p => p.id));

    let movimientos = DB.movimientosRecientes(500).filter(m => {
        if (m.tipo === "transferencia") return m.origen === a.nombre || m.destino === a.nombre;
        return idsProductosAlmacen.has(m.productoId);
    });

    if (filtroTipoHistorialAlmacen !== "todo") {
        movimientos = movimientos.filter(m => m.tipo === filtroTipoHistorialAlmacen);
    }

    if (filtroHistorialAlmacen !== "todo") {
        const ahora = new Date();
        movimientos = movimientos.filter(m => {
            const fecha = new Date(m.fecha);
            if (filtroHistorialAlmacen === "hoy") return fecha.toDateString() === ahora.toDateString();
            if (filtroHistorialAlmacen === "semana") { const s = new Date(ahora); s.setDate(ahora.getDate() - 7); return fecha >= s; }
            if (filtroHistorialAlmacen === "mes") return fecha.getMonth() === ahora.getMonth() && fecha.getFullYear() === ahora.getFullYear();
            return true;
        });
    }

    if (movimientos.length === 0) {
        lista.innerHTML = `<p style="text-align:center;color:var(--text2);padding:30px 0;">No hay movimientos en este período.</p>`;
        return;
    }

    lista.innerHTML = movimientos.map(m => {
        const p = DB.buscarProducto(m.productoId);
        const nombre = p ? p.nombre : "Producto eliminado";
        const unidad = p ? (p.unidad || "") : "";
        const fecha = new Date(m.fecha);
        const fechaStr = fecha.toLocaleDateString("es-CU") + " " + fecha.toLocaleTimeString("es-CU", { hour: "2-digit", minute: "2-digit" });

        if (m.tipo === "transferencia") {
            const direccion = m.destino === a.nombre ? `${m.origen} → ${a.nombre}` : `${a.nombre} → ${m.destino}`;
            return `
            <div class="mov-card">
                <div class="mov-icono" style="background:rgba(99,179,237,0.1)">🔄</div>
                <div class="mov-info">
                    <h4>${nombre}</h4>
                    <p>${direccion}</p>
                    <p style="font-size:11px;color:var(--text3);margin-top:2px;">${fechaStr}</p>
                </div>
                <div class="mov-cantidad"><strong style="color:#63b3ed">${m.cantidad} ${unidad}</strong></div>
            </div>`;
        }

        const esEntrada = m.tipo === "entrada" || m.tipo === "ajuste";
        const icono = m.tipo === "ajuste" ? "🔢" : esEntrada ? "📥" : "📤";
        const claseIcono = m.tipo === "ajuste" ? "" : esEntrada ? "mov-entrada" : "mov-salida";
        const signo = m.tipo === "ajuste" ? "" : esEntrada ? "+" : "-";
        let detalle = "";
        if (m.tipo === "ajuste") detalle = `🔢 Ajuste: ${m.cantidadAnterior} → ${m.cantidadNueva}`;
        else if (m.tipo === "entrada") detalle = m.proveedor ? `Proveedor: ${m.proveedor}` : m.nota || "Entrada de mercancía";
        else detalle = m.nota || "Salida";

        return `
        <div class="mov-card">
            <div class="mov-icono ${claseIcono}" style="${m.tipo==='ajuste'?'background:rgba(245,197,66,0.1)':''}">${icono}</div>
            <div class="mov-info">
                <h4>${nombre}</h4>
                <p>${detalle}</p>
                <p style="font-size:11px;color:var(--text3);margin-top:2px;">${fechaStr}</p>
            </div>
            <div class="mov-cantidad">
                <strong class="${esEntrada?'entrada-text':'salida-text'}">${signo}${m.cantidad} ${unidad}</strong>
                ${(typeof m.costoReal === "number") ? `<span class="mov-costo-real">Costo real: ${m.costoReal.toLocaleString("es-CU", {maximumFractionDigits:0})}/u</span>` : ''}
            </div>
        </div>`;
    }).join("");
}

// ═══════════════════════════════════════════════
// ESTADÍSTICAS DEL ALMACÉN
// ═══════════════════════════════════════════════
function mostrarEstadisticasAlmacen() {
    const a = DB.almacenes.find(al => al.id === almacenActualId);
    if (!a) return;
    const est = estadisticasAlmacen(a.nombre);
    const moneda = DB.configuracion.moneda || "CUP";
    const margen = est.valor > 0 ? Math.round((est.ganancia / est.valor) * 100) : 0;

    document.getElementById("almEstCompra").innerText = est.valor.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("almEstVenta").innerText = est.valorVenta.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("almEstGanancia").innerText = est.ganancia.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("almEstMargen").innerText = margen + "%";

    // Movimientos de los últimos 30 días relacionados con este almacén
    const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30);
    const idsProductosAlmacen = new Set(DB.productos.filter(p => p.almacen === a.nombre).map(p => p.id));
    const movimientos30 = DB.movimientos.filter(m => {
        if (new Date(m.fecha) < hace30) return false;
        if (m.tipo === "transferencia") return m.origen === a.nombre || m.destino === a.nombre;
        return idsProductosAlmacen.has(m.productoId);
    });
    const entradas = movimientos30.filter(m => m.tipo === "entrada").length;
    const salidas = movimientos30.filter(m => m.tipo === "salida").length;
    const transferencias = movimientos30.filter(m => m.tipo === "transferencia").length;

    document.getElementById("almEstEntradas").innerText = entradas + " movimiento" + (entradas !== 1 ? "s" : "");
    document.getElementById("almEstSalidas").innerText = salidas + " movimiento" + (salidas !== 1 ? "s" : "");
    document.getElementById("almEstTransferencias").innerText = transferencias + " movimiento" + (transferencias !== 1 ? "s" : "");

    const sinDatos = document.getElementById("almEstSinDatos");
    sinDatos.classList.toggle("oculto", movimientos30.length > 0);

    // Alertas de stock bajo de este almacén
    const bajos = est.productos.filter(p => p.cantidad <= p.stockMinimo);
    const alertasLista = document.getElementById("almAlertasLista");
    const btnCompartir = document.getElementById("btnCompartirAlertas");

    if (bajos.length === 0) {
        alertasLista.innerHTML = `<div class="cfg-row" style="cursor:default;"><div class="cfg-row-body"><span class="cfg-row-titulo" style="color:var(--accent)">✅ Todo en orden</span><span class="cfg-row-sub">No hay productos con stock bajo en este almacén</span></div></div>`;
        btnCompartir.style.display = "none";
    } else {
        alertasLista.innerHTML = bajos.map((p, i) => `
            <div class="cfg-row" style="cursor:default;">
                <div class="cfg-row-body">
                    <span class="cfg-row-titulo">${ICONOS[p.categoria] || "📦"} ${p.nombre}</span>
                    <span class="cfg-row-sub">${p.cantidad} ${p.unidad || "unidades"} disponibles</span>
                </div>
            </div>${i < bajos.length - 1 ? '<div class="cfg-row-sep"></div>' : ''}`).join("");
        btnCompartir.style.display = "flex";
    }
}

function compartirAlertasAlmacen() {
    const a = DB.almacenes.find(al => al.id === almacenActualId);
    if (!a) return;
    const est = estadisticasAlmacen(a.nombre);
    const bajos = est.productos.filter(p => p.cantidad <= p.stockMinimo);
    if (bajos.length === 0) return;
    let txt = `⚠️ *Productos para reponer — ${a.nombre}*\n\n`;
    bajos.forEach(p => { txt += `• ${p.nombre} (${p.cantidad} ${p.unidad || "uds"})\n`; });
    window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
}

// ═══════════════════════════════════════════════
// AJUSTES DEL ALMACÉN (vista de solo lectura)
// ═══════════════════════════════════════════════
function mostrarAjustesAlmacen() {
    const a = DB.almacenes.find(al => al.id === almacenActualId);
    if (!a) return;
    document.getElementById("almAjusteResponsable").innerText = a.responsable || "No asignado";
    document.getElementById("almAjusteDireccion").innerText = a.direccion || "No especificada";
    document.getElementById("almAjusteVentasIcon").innerText = a.permiteVentas !== false ? "✓" : "✕";
    document.getElementById("almAjusteVentasIcon").style.color = a.permiteVentas !== false ? "var(--accent)" : "var(--warn)";
    document.getElementById("almAjusteTransfIcon").innerText = a.permiteTransferencias !== false ? "✓" : "✕";
    document.getElementById("almAjusteTransfIcon").style.color = a.permiteTransferencias !== false ? "var(--accent)" : "var(--warn)";
    document.getElementById("almAjusteActivoIcon").innerText = a.activo !== false ? "✓" : "✕";
    document.getElementById("almAjusteActivoIcon").style.color = a.activo !== false ? "var(--accent)" : "var(--warn)";
}

// ═══════════════════════════════════════════════
// MÓDULO GASTOS
// ═══════════════════════════════════════════════
function rangoHoy() {
    const inicio = new Date(); inicio.setHours(0,0,0,0);
    const fin = new Date(); fin.setHours(23,59,59,999);
    return { inicio, fin };
}
function rangoSemana() {
    const fin = new Date(); fin.setHours(23,59,59,999);
    const inicio = new Date(); inicio.setDate(inicio.getDate() - 7); inicio.setHours(0,0,0,0);
    return { inicio, fin };
}
function rangoMes() {
    const inicio = new Date(); inicio.setDate(1); inicio.setHours(0,0,0,0);
    const fin = new Date(); fin.setHours(23,59,59,999);
    return { inicio, fin };
}

function totalGastos(lista) {
    return lista.reduce((sum, g) => sum + (g.monto || 0), 0);
}

function mostrarGastos() {
    const lista = document.getElementById("listaGastos");
    const texto = document.getElementById("buscarGasto").value.toLowerCase();
    const categoria = document.getElementById("filtroCategoriaGasto").value;
    const periodo = document.getElementById("filtroPeriodoGasto").value;
    const moneda = DB.configuracion.moneda || "CUP";

    let gastos = [...DB.gastos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    if (texto) gastos = gastos.filter(g => g.concepto.toLowerCase().includes(texto));
    if (categoria) gastos = gastos.filter(g => g.categoria === categoria);
    if (periodo) {
        let rango;
        if (periodo === "hoy") rango = rangoHoy();
        else if (periodo === "semana") rango = rangoSemana();
        else if (periodo === "mes") rango = rangoMes();
        if (rango) gastos = gastos.filter(g => { const f = new Date(g.fecha); return f >= rango.inicio && f <= rango.fin; });
    }

    // Resumen superior (siempre sobre el total, no sobre el filtro)
    const hoy = rangoHoy(), semana = rangoSemana(), mes = rangoMes();
    const gastosHoy = totalGastos(DB.gastosEnRango(hoy.inicio, hoy.fin));
    const gastosSemana = totalGastos(DB.gastosEnRango(semana.inicio, semana.fin));
    const gastosMes = totalGastos(DB.gastosEnRango(mes.inicio, mes.fin));

    document.getElementById("gasResumenHoy").innerText = gastosHoy.toLocaleString("es-CU");
    document.getElementById("gasResumenSemana").innerText = gastosSemana.toLocaleString("es-CU");
    document.getElementById("gasResumenMes").innerText = gastosMes.toLocaleString("es-CU");

    // Ganancia neta del mes = ganancia bruta del mes (ventas - costo FIFO) - gastos del mes
    const ventasMes = DB.movimientos.filter(m => m.tipo === "salida" && new Date(m.fecha) >= mes.inicio && new Date(m.fecha) <= mes.fin);
    let gananciaBrutaMes = 0;
    ventasMes.forEach(m => {
        const costoUnit = (typeof m.costoReal === "number") ? m.costoReal : 0;
        gananciaBrutaMes += ((m.precioUnitario || 0) - costoUnit) * (m.cantidad || 0);
    });
    const gananciaNetaMes = gananciaBrutaMes - gastosMes;
    document.getElementById("gasResumenGananciaNeta").innerText = gananciaNetaMes.toLocaleString("es-CU");

    const menuGastos = document.getElementById("menuTotalGastos");
    if (menuGastos) menuGastos.innerText = gastosMes.toLocaleString("es-CU") + " " + moneda + " este mes";

    document.getElementById("dashFinSubtitulo") && null; // placeholder no-op

    if (gastos.length === 0) {
        lista.innerHTML = `<p style="text-align:center;color:var(--text2);padding:40px 0;">No hay gastos registrados.</p>`;
        return;
    }

    lista.innerHTML = gastos.map(g => {
        const cat = CATEGORIAS_GASTO[g.categoria] || { nombre: g.categoria, icono: "🧾" };
        const fecha = new Date(g.fecha);
        const fechaStr = fecha.toLocaleDateString("es-CU");
        const almacenTxt = g.almacen ? ` · 🏪 ${g.almacen}` : "";
        const recurrenteTag = g.recurrente ? `<span class="badge-pro" style="background:rgba(99,179,237,0.15);color:#63b3ed;">🔁 Recurrente</span>` : "";
        return `
        <div class="gas-card" onclick="abrirModalGasto('${g.id}')">
            <div class="gas-card-icono">${cat.icono}</div>
            <div class="gas-card-info">
                <h4>${g.concepto}${recurrenteTag}</h4>
                <p>${cat.nombre}${almacenTxt} · ${fechaStr}</p>
            </div>
            <div class="gas-card-monto">-${(g.monto||0).toLocaleString("es-CU")} ${moneda}</div>
        </div>`;
    }).join("");
}

function abrirModalGasto(id) {
    const select = document.getElementById("gasAlmacen");
    select.innerHTML = `<option value="">— General / Sin asociar —</option>` +
        DB.almacenes.filter(a => a.activo !== false).map(a => `<option value="${a.nombre}">${a.emoji || "🏪"} ${a.nombre}</option>`).join("");

    if (id) {
        const g = DB.buscarGasto(id);
        if (!g) return;
        editandoGastoId = id;
        document.getElementById("modalGastoTitulo").innerText = "✏️ Editar Gasto";
        document.getElementById("gasConcepto").value = g.concepto || "";
        document.getElementById("gasMonto").value = g.monto || "";
        document.getElementById("gasCategoria").value = g.categoria || "";
        document.getElementById("gasFecha").value = g.fecha ? g.fecha.slice(0, 10) : "";
        document.getElementById("gasAlmacen").value = g.almacen || "";
        document.getElementById("gasComprobante").value = g.comprobante || "";
        document.getElementById("gasRecurrente").checked = g.recurrente === true;
        document.getElementById("gasNota").value = g.nota || "";
        document.getElementById("btnEliminarGasto").classList.remove("oculto");
    } else {
        editandoGastoId = null;
        document.getElementById("modalGastoTitulo").innerText = "🧾 Nuevo Gasto";
        document.getElementById("gasConcepto").value = "";
        document.getElementById("gasMonto").value = "";
        document.getElementById("gasCategoria").value = "";
        document.getElementById("gasFecha").value = new Date().toISOString().slice(0, 10);
        document.getElementById("gasAlmacen").value = "";
        document.getElementById("gasComprobante").value = "";
        document.getElementById("gasRecurrente").checked = false;
        document.getElementById("btnEliminarGasto").classList.add("oculto");
        document.getElementById("gasNota").value = "";
    }
    document.getElementById("modalGasto").classList.remove("oculto");
    document.getElementById("btnNuevoGasto").classList.add("ocultar-boton");
}

function cerrarModalGasto() {
    document.getElementById("modalGasto").classList.add("oculto");
    document.getElementById("btnNuevoGasto").classList.remove("ocultar-boton");
    editandoGastoId = null;
}

document.getElementById("btnGuardarGasto").addEventListener("click", () => {
    const concepto = document.getElementById("gasConcepto").value.trim();
    const monto = Number(document.getElementById("gasMonto").value);
    const categoria = document.getElementById("gasCategoria").value;
    const fecha = document.getElementById("gasFecha").value;
    if (!concepto) { alert("⚠️ El concepto es obligatorio."); return; }
    if (!monto || monto <= 0) { alert("⚠️ El monto debe ser mayor a 0."); return; }
    if (!categoria) { alert("⚠️ Selecciona una categoría."); return; }
    if (!fecha) { alert("⚠️ Selecciona una fecha."); return; }

    const datos = {
        concepto, monto, categoria,
        fecha: new Date(fecha).toISOString(),
        almacen: document.getElementById("gasAlmacen").value,
        comprobante: document.getElementById("gasComprobante").value.trim(),
        recurrente: document.getElementById("gasRecurrente").checked,
        nota: document.getElementById("gasNota").value.trim()
    };

    if (editandoGastoId) {
        DB.actualizarGasto(editandoGastoId, datos);
        mostrarToast("✅ Gasto actualizado");
    } else {
        DB.agregarGasto(datos);
        mostrarToast("✅ Gasto registrado");
    }
    cerrarModalGasto();
    mostrarGastos();
});

function eliminarGastoActual() {
    if (!editandoGastoId) return;
    if (!confirm("¿Eliminar este gasto?")) return;
    DB.eliminarGasto(editandoGastoId);
    cerrarModalGasto();
    mostrarGastos();
    mostrarToast("✅ Gasto eliminado");
}

function toggleMenuOpcionesGastos() {
    document.getElementById("menuOpcionesGastos").classList.toggle("oculto");
}

// ── Gastos recurrentes pendientes ──
function verificarRecurrentesPendientes() {
    const cont = document.getElementById("gasRecurrentesPendientes");
    if (!cont) return;
    const mes = rangoMes();
    // Encuentra gastos marcados como recurrentes de meses anteriores que no tienen versión este mes (mismo concepto)
    const recurrentesUnicos = {};
    DB.gastos.filter(g => g.recurrente).forEach(g => {
        if (!recurrentesUnicos[g.concepto] || new Date(g.fecha) > new Date(recurrentesUnicos[g.concepto].fecha)) {
            recurrentesUnicos[g.concepto] = g;
        }
    });
    const pendientes = Object.values(recurrentesUnicos).filter(g => new Date(g.fecha) < mes.inicio);

    if (pendientes.length === 0) { cont.classList.add("oculto"); cont.innerHTML = ""; return; }

    const moneda = DB.configuracion.moneda || "CUP";
    cont.classList.remove("oculto");
    cont.innerHTML = `
        <div class="cfg-info-box" style="border-color:rgba(99,179,237,0.3); background:rgba(99,179,237,0.06);">
            <span>🔁</span>
            <p><strong>${pendientes.length} gasto${pendientes.length>1?'s':''} recurrente${pendientes.length>1?'s':''}</strong> de meses anteriores. ¿Generar este mes?</p>
        </div>
        ${pendientes.map(g => {
            const cat = CATEGORIAS_GASTO[g.categoria] || { nombre: g.categoria, icono: "🧾" };
            return `
            <div class="gas-recurrente-row">
                <span>${cat.icono} ${g.concepto} — ${g.monto.toLocaleString("es-CU")} ${moneda}</span>
                <button onclick="generarGastoRecurrente('${g.id}')">＋ Generar</button>
            </div>`;
        }).join("")}
    `;
}

function generarGastoRecurrente(idOriginal) {
    const original = DB.buscarGasto(idOriginal);
    if (!original) return;
    DB.agregarGasto({
        concepto: original.concepto,
        monto: original.monto,
        categoria: original.categoria,
        fecha: new Date().toISOString(),
        almacen: original.almacen,
        comprobante: "",
        recurrente: true,
        nota: "Generado automáticamente desde gasto recurrente"
    });
    mostrarToast(`✅ ${original.concepto} generado para este mes`);
    mostrarGastos();
    verificarRecurrentesPendientes();
}

// ── Dashboard Financiero ──
function abrirDashboardFinanciero() {
    mostrarPantalla("pantallaDashboardFinanciero");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    actualizarDashboardFinanciero();
}

function cambiarPeriodoDashFin(btn) {
    document.querySelectorAll("#pantallaDashboardFinanciero .chip-filtro").forEach(c => c.classList.remove("activo"));
    btn.classList.add("activo");
    periodoDashFin = btn.dataset.periodo;
    actualizarDashboardFinanciero();
}

function actualizarDashboardFinanciero() {
    let rango;
    let etiqueta;
    if (periodoDashFin === "hoy") { rango = rangoHoy(); etiqueta = "Hoy"; }
    else if (periodoDashFin === "semana") { rango = rangoSemana(); etiqueta = "Esta semana"; }
    else { rango = rangoMes(); etiqueta = "Este mes"; }

    document.getElementById("dashFinSubtitulo").innerText = etiqueta;
    const moneda = DB.configuracion.moneda || "CUP";

    const ventas = DB.movimientos.filter(m => m.tipo === "salida" && new Date(m.fecha) >= rango.inicio && new Date(m.fecha) <= rango.fin);
    let totalVentas = 0, totalCosto = 0;
    ventas.forEach(m => {
        totalVentas += (m.precioUnitario || 0) * (m.cantidad || 0);
        const costoUnit = (typeof m.costoReal === "number") ? m.costoReal : 0;
        totalCosto += costoUnit * (m.cantidad || 0);
    });
    const gananciaBruta = totalVentas - totalCosto;

    const gastosRango = DB.gastosEnRango(rango.inicio, rango.fin);
    const totalGastosRango = totalGastos(gastosRango);
    const gananciaNeta = gananciaBruta - totalGastosRango;

    document.getElementById("dfVentas").innerText = totalVentas.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("dfCosto").innerText = totalCosto.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("dfGananciaBruta").innerText = gananciaBruta.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("dfGastos").innerText = totalGastosRango.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("dfGananciaNeta").innerText = gananciaNeta.toLocaleString("es-CU") + " " + moneda;

    // Gastos por categoría
    const porCategoria = {};
    gastosRango.forEach(g => { porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + g.monto; });
    const catEl = document.getElementById("dfGastosPorCategoria");
    const catKeys = Object.keys(porCategoria).sort((a, b) => porCategoria[b] - porCategoria[a]);
    if (catKeys.length === 0) {
        catEl.innerHTML = `<div class="cfg-row" style="cursor:default;"><div class="cfg-row-body"><span class="cfg-row-sub">Sin gastos en este período</span></div></div>`;
    } else {
        catEl.innerHTML = catKeys.map((k, i) => {
            const cat = CATEGORIAS_GASTO[k] || { nombre: k, icono: "🧾" };
            return `<div class="cfg-row" style="cursor:default;">
                <div class="cfg-row-body"><span class="cfg-row-titulo">${cat.icono} ${cat.nombre}</span></div>
                <strong style="color:var(--warn);font-family:'Syne',Arial,sans-serif;">${porCategoria[k].toLocaleString("es-CU")} ${moneda}</strong>
            </div>${i < catKeys.length - 1 ? '<div class="cfg-row-sep"></div>' : ''}`;
        }).join("");
    }

    // Gastos por almacén
    const porAlmacen = {};
    gastosRango.forEach(g => { const key = g.almacen || "Sin asociar"; porAlmacen[key] = (porAlmacen[key] || 0) + g.monto; });
    const almEl = document.getElementById("dfGastosPorAlmacen");
    const almKeys = Object.keys(porAlmacen).sort((a, b) => porAlmacen[b] - porAlmacen[a]);
    if (almKeys.length === 0) {
        almEl.innerHTML = `<div class="cfg-row" style="cursor:default;"><div class="cfg-row-body"><span class="cfg-row-sub">Sin gastos en este período</span></div></div>`;
    } else {
        almEl.innerHTML = almKeys.map((k, i) => `
            <div class="cfg-row" style="cursor:default;">
                <div class="cfg-row-body"><span class="cfg-row-titulo">🏪 ${k}</span></div>
                <strong style="color:var(--warn);font-family:'Syne',Arial,sans-serif;">${porAlmacen[k].toLocaleString("es-CU")} ${moneda}</strong>
            </div>${i < almKeys.length - 1 ? '<div class="cfg-row-sep"></div>' : ''}`).join("");
    }
}

// ── Exportar Gastos ──
function exportarGastosExcel() {
    document.getElementById("menuOpcionesGastos").classList.add("oculto");
    const datos = DB.gastos.map(g => ({
        Concepto: g.concepto, Categoría: CATEGORIAS_GASTO[g.categoria]?.nombre || g.categoria,
        Monto: g.monto, Fecha: new Date(g.fecha).toLocaleDateString("es-CU"),
        Almacén: g.almacen || "", Comprobante: g.comprobante || "",
        Recurrente: g.recurrente ? "Sí" : "No", Nota: g.nota || ""
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gastos");
    XLSX.writeFile(wb, "gastos-arb.xlsx");
}

function exportarGastosPDF() {
    document.getElementById("menuOpcionesGastos").classList.add("oculto");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const cfg = DB.configuracion;
    doc.setFontSize(16);
    doc.text("INVENTARY ARB — Gastos — " + (cfg.nombreNegocio || "Mi Negocio"), 14, 15);
    doc.setFontSize(10);
    doc.text("Generado: " + new Date().toLocaleDateString("es-CU"), 14, 22);
    doc.autoTable({
        startY: 28,
        head: [["Concepto","Categoría","Monto","Fecha","Almacén"]],
        body: DB.gastos.map(g => [
            g.concepto, CATEGORIAS_GASTO[g.categoria]?.nombre || g.categoria,
            (g.monto||0).toLocaleString("es-CU") + " " + (cfg.moneda||"CUP"),
            new Date(g.fecha).toLocaleDateString("es-CU"), g.almacen || "—"
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [255, 107, 74] }
    });
    doc.save("gastos-arb.pdf");
}

// ═══════════════════════════════════════════════
// MÓDULO CLIENTES Y FIADOS
// ═══════════════════════════════════════════════
const RIESGO = { verde: "🟢 Al día", amarillo: "🟡 Pago lento", rojo: "🔴 Moroso" };

function mostrarClientes() {
    const lista = document.getElementById("listaClientes");
    const texto = document.getElementById("buscarCliente").value.toLowerCase();
    const filtroEstado = document.getElementById("filtroEstadoCliente").value;
    const moneda = DB.configuracion.moneda || "CUP";

    let clientes = [...DB.clientes];
    if (texto) clientes = clientes.filter(c => c.nombre.toLowerCase().includes(texto) || (c.telefono||"").includes(texto));
    if (filtroEstado) clientes = clientes.filter(c => DB.nivelRiesgo(c.id) === filtroEstado);

    // Resumen dashboard
    const total = DB.clientes.length;
    const porCobrar = DB.clientes.reduce((sum, c) => sum + DB.saldoCliente(c.id), 0);
    const vencidos = DB.clientes.reduce((sum, c) => sum + DB.fiadosVencidos(c.id).reduce((s, m) => s + (m.precioUnitario||0)*(m.cantidad||0), 0), 0);
    const alDia = DB.clientes.filter(c => DB.nivelRiesgo(c.id) === "verde").length;
    document.getElementById("cliResumenTotal").innerText = total;
    document.getElementById("cliResumenPorCobrar").innerText = porCobrar.toLocaleString("es-CU");
    document.getElementById("cliResumenVencidos").innerText = vencidos.toLocaleString("es-CU");
    document.getElementById("cliResumenAlDia").innerText = alDia;
    const menuEl = document.getElementById("menuResumenClientes");
    if (menuEl) menuEl.innerText = total + " cliente" + (total !== 1 ? "s" : "");

    if (clientes.length === 0) {
        lista.innerHTML = `<p style="text-align:center;color:var(--text2);padding:40px 0;">${DB.clientes.length === 0 ? "No hay clientes registrados." : "Sin resultados."}</p>`;
        return;
    }

    lista.innerHTML = clientes.map(c => {
        const saldo = DB.saldoCliente(c.id);
        const riesgo = DB.nivelRiesgo(c.id);
        const saldoTxt = saldo > 0 ? `Debe: ${saldo.toLocaleString("es-CU")} ${moneda}` : "✅ Sin deuda";
        return `
        <div class="gas-card" onclick="abrirPerfilCliente('${c.id}')">
            <div class="gas-card-icono" style="background:rgba(245,197,66,0.1);">👤</div>
            <div class="gas-card-info">
                <h4>${c.nombre} <span style="font-size:11px;">${RIESGO[riesgo]}</span></h4>
                <p>${saldoTxt}${c.telefono ? " · 📞 "+c.telefono : ""}</p>
            </div>
            <span style="color:var(--text3);font-size:20px;">›</span>
        </div>`;
    }).join("");
}

function actualizarPerfilCliente() {
    const c = DB.buscarCliente(clienteActualId); if (!c) return;
    const moneda = DB.configuracion.moneda || "CUP";
    const saldo = DB.saldoCliente(c.id);
    const riesgo = DB.nivelRiesgo(c.id);
    const vencidosMonto = DB.fiadosVencidos(c.id).reduce((s, m) => s + (m.precioUnitario||0)*(m.cantidad||0), 0);

    document.getElementById("perfilClienteNombre").innerText = c.nombre;
    document.getElementById("perfilClienteEstado").innerText = RIESGO[riesgo];

    const telEl = document.getElementById("perfilClienteTelefono");
    if (c.telefono) { telEl.classList.remove("oculto"); document.getElementById("perfilClienteTelefonoVal").innerText = c.telefono; }
    else telEl.classList.add("oculto");

    const dirEl = document.getElementById("perfilClienteDireccion");
    if (c.direccion) { dirEl.classList.remove("oculto"); document.getElementById("perfilClienteDireccionVal").innerText = c.direccion; }
    else dirEl.classList.add("oculto");

    document.getElementById("perfilSaldo").innerText = saldo.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("perfilLimite").innerText = c.limiteCredito > 0 ? c.limiteCredito.toLocaleString("es-CU") + " " + moneda : "Sin límite";

    const vencidoRow = document.getElementById("perfilVencidoRow");
    if (vencidosMonto > 0) {
        vencidoRow.style.display = "flex";
        document.getElementById("perfilVencido").innerText = vencidosMonto.toLocaleString("es-CU") + " " + moneda;
    } else vencidoRow.style.display = "none";

    cambiarTabCliente(tabClienteActual);
}

function cambiarTabCliente(tab) {
    tabClienteActual = tab;
    document.getElementById("cliTabFiados").classList.toggle("activo", tab === "fiados");
    document.getElementById("cliTabAbonos").classList.toggle("activo", tab === "abonos");
    document.getElementById("cliContenidoFiados").classList.toggle("oculto", tab !== "fiados");
    document.getElementById("cliContenidoAbonos").classList.toggle("oculto", tab !== "abonos");
    if (tab === "fiados") renderFiadosCliente();
    else renderAbonosCliente();
}

function renderFiadosCliente() {
    const c = DB.buscarCliente(clienteActualId); if (!c) return;
    const moneda = DB.configuracion.moneda || "CUP";
    const fiados = DB.movimientos.filter(m => m.clienteId === clienteActualId && m.tipo === "salida" && m.metodoPago === "fiado")
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const el = document.getElementById("cliContenidoFiados");
    if (fiados.length === 0) { el.innerHTML = `<p style="text-align:center;color:var(--text2);padding:30px 0;">Sin ventas fiadas.</p>`; return; }
    el.innerHTML = fiados.map(m => {
        const p = DB.buscarProducto(m.productoId);
        const nombre = p ? p.nombre : "Producto eliminado";
        const total = (m.precioUnitario||0) * (m.cantidad||0);
        const fecha = new Date(m.fecha).toLocaleDateString("es-CU");
        const vence = m.fechaVencimiento ? " · Vence: " + new Date(m.fechaVencimiento).toLocaleDateString("es-CU") : "";
        const estado = m.saldado ? `<span style="color:var(--accent);font-size:11px;">✅ Saldado</span>` : `<span style="color:var(--warn);font-size:11px;">⏳ Pendiente</span>`;
        return `
        <div class="gas-card" style="margin-bottom:8px;">
            <div class="gas-card-icono" style="background:rgba(255,107,74,0.1);">🧾</div>
            <div class="gas-card-info">
                <h4>${nombre} x${m.cantidad} ${estado}</h4>
                <p>${fecha}${vence}</p>
            </div>
            <div class="gas-card-monto">${total.toLocaleString("es-CU")} ${moneda}</div>
        </div>`;
    }).join("");
}

function renderAbonosCliente() {
    const c = DB.buscarCliente(clienteActualId); if (!c) return;
    const moneda = DB.configuracion.moneda || "CUP";
    const el = document.getElementById("cliContenidoAbonos");
    if (!c.abonos || c.abonos.length === 0) { el.innerHTML = `<p style="text-align:center;color:var(--text2);padding:30px 0;">Sin abonos registrados.</p>`; return; }
    const abonos = [...c.abonos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    el.innerHTML = abonos.map(a => `
        <div class="gas-card" style="margin-bottom:8px;">
            <div class="gas-card-icono" style="background:rgba(0,232,150,0.1);">💵</div>
            <div class="gas-card-info">
                <h4>Abono</h4>
                <p>${new Date(a.fecha).toLocaleDateString("es-CU")}${a.nota ? " · " + a.nota : ""}</p>
            </div>
            <div class="gas-card-monto" style="color:var(--accent);">+${a.monto.toLocaleString("es-CU")} ${moneda}</div>
        </div>`).join("");
}

// ── Modal Cliente ──
function abrirModalCliente(id) {
    if (id) {
        const c = DB.buscarCliente(id); if (!c) return;
        editandoClienteId = id;
        document.getElementById("modalClienteTitulo").innerText = "✏️ Editar Cliente";
        document.getElementById("cliNombre").value = c.nombre || "";
        document.getElementById("cliTelefono").value = c.telefono || "";
        document.getElementById("cliDireccion").value = c.direccion || "";
        document.getElementById("cliLimite").value = c.limiteCredito || "";
        document.getElementById("cliObservaciones").value = c.observaciones || "";
        document.getElementById("btnEliminarCliente").classList.remove("oculto");
    } else {
        editandoClienteId = null;
        document.getElementById("modalClienteTitulo").innerText = "👤 Nuevo Cliente";
        ["cliNombre","cliTelefono","cliDireccion","cliObservaciones"].forEach(id => document.getElementById(id).value = "");
        document.getElementById("cliLimite").value = "";
        document.getElementById("btnEliminarCliente").classList.add("oculto");
    }
    document.getElementById("modalCliente").classList.remove("oculto");
}

function cerrarModalCliente() {
    document.getElementById("modalCliente").classList.add("oculto");
    editandoClienteId = null;
}

document.getElementById("btnGuardarCliente").addEventListener("click", () => {
    const nombre = document.getElementById("cliNombre").value.trim();
    if (!nombre) { alert("⚠️ El nombre es obligatorio."); return; }
    const datos = {
        nombre,
        telefono: document.getElementById("cliTelefono").value.trim(),
        direccion: document.getElementById("cliDireccion").value.trim(),
        limiteCredito: Number(document.getElementById("cliLimite").value) || 0,
        observaciones: document.getElementById("cliObservaciones").value.trim()
    };
    if (editandoClienteId) {
        DB.actualizarCliente(editandoClienteId, datos);
        mostrarToast("✅ Cliente actualizado");
        cerrarModalCliente();
        if (clienteActualId === editandoClienteId) actualizarPerfilCliente();
    } else {
        const nuevo = DB.agregarCliente(datos);
        mostrarToast("✅ Cliente registrado");
        cerrarModalCliente();
    }
    mostrarClientes();
});

function eliminarClienteActual() {
    if (!editandoClienteId) return;
    const c = DB.buscarCliente(editandoClienteId);
    if (DB.saldoCliente(editandoClienteId) > 0) { alert("⚠️ Este cliente tiene deuda pendiente. Sáldala antes de eliminarlo."); return; }
    if (!confirm(`¿Eliminar a ${c.nombre}? Esta acción no se puede deshacer.`)) return;
    DB.eliminarCliente(editandoClienteId);
    cerrarModalCliente();
    mostrarToast("✅ Cliente eliminado");
    volverClientes();
}

// ── Abonos ──
function abrirModalAbono() {
    const c = DB.buscarCliente(clienteActualId); if (!c) return;
    document.getElementById("abonoClienteNombre").innerText = "Cliente: " + c.nombre + " · Saldo: " + DB.saldoCliente(c.id).toLocaleString("es-CU") + " " + (DB.configuracion.moneda||"CUP");
    document.getElementById("abonoMonto").value = "";
    document.getElementById("abonoFecha").value = new Date().toISOString().slice(0,10);
    document.getElementById("abonoNota").value = "";
    document.getElementById("modalAbono").classList.remove("oculto");
}

function cerrarModalAbono() { document.getElementById("modalAbono").classList.add("oculto"); }

document.getElementById("btnConfirmarAbono").addEventListener("click", () => {
    const monto = Number(document.getElementById("abonoMonto").value);
    const fecha = document.getElementById("abonoFecha").value;
    const nota = document.getElementById("abonoNota").value.trim();
    const c = DB.buscarCliente(clienteActualId); if (!c) return;
    if (!monto || monto <= 0) { alert("⚠️ El monto debe ser mayor a 0."); return; }
    const saldo = DB.saldoCliente(clienteActualId);
    if (monto > saldo) { alert(`⚠️ El abono (${monto}) supera el saldo pendiente (${saldo}). Usa "Saldar todo" si quieres cerrar la deuda.`); return; }
    if (!c.abonos) c.abonos = [];
    c.abonos.push({ id: "abono_" + Date.now(), monto, fecha: new Date(fecha).toISOString(), nota });
    DB.guardar();
    mostrarToast(`✅ Abono de ${monto.toLocaleString("es-CU")} registrado`);
    cerrarModalAbono();
    actualizarPerfilCliente();
});

function saldarTodo() {
    const c = DB.buscarCliente(clienteActualId); if (!c) return;
    const saldo = DB.saldoCliente(clienteActualId);
    if (saldo === 0) { mostrarToast("✅ Este cliente ya está al día."); return; }
    if (!confirm(`¿Saldar toda la deuda de ${c.nombre} (${saldo.toLocaleString("es-CU")} CUP)?`)) return;
    if (!c.abonos) c.abonos = [];
    c.abonos.push({ id: "abono_" + Date.now(), monto: saldo, fecha: new Date().toISOString(), nota: "Saldo total" });
    // Marcar todos los fiados como saldados
    DB.movimientos.filter(m => m.clienteId === clienteActualId && m.tipo === "salida" && m.metodoPago === "fiado" && !m.saldado)
        .forEach(m => m.saldado = true);
    DB.guardar();
    mostrarToast("✅ Deuda saldada completamente");
    actualizarPerfilCliente();
}

// ── Sheet de clientes ──
function abrirSheetClientes() {
    document.getElementById("sheetBuscadorClientes").value = "";
    renderSheetListaClientes();
    document.getElementById("sheetClientes").classList.remove("oculto");
    setTimeout(() => document.getElementById("sheetBuscadorClientes").focus(), 300);
}

function cerrarSheetClientes() { document.getElementById("sheetClientes").classList.add("oculto"); }

function cerrarSheetClientesSiOverlay(e) { if (e.target === document.getElementById("sheetClientes")) cerrarSheetClientes(); }

function renderSheetListaClientes() {
    const texto = document.getElementById("sheetBuscadorClientes").value.toLowerCase();
    const lista = document.getElementById("sheetListaClientes");
    let clientes = DB.clientes;
    if (texto) clientes = clientes.filter(c => c.nombre.toLowerCase().includes(texto));
    if (clientes.length === 0) { lista.innerHTML = `<p style="text-align:center;padding:20px;color:var(--text2);">No hay clientes.</p>`; return; }
    const moneda = DB.configuracion.moneda || "CUP";
    lista.innerHTML = clientes.map(c => {
        const saldo = DB.saldoCliente(c.id);
        const riesgo = DB.nivelRiesgo(c.id);
        return `
        <div class="sheet-item" onclick="seleccionarClienteFiado('${c.id}')">
            <div class="si-icono">👤</div>
            <div class="si-info"><h4>${c.nombre}</h4><p>${RIESGO[riesgo]}</p></div>
            <div class="si-stock"><strong>${saldo > 0 ? saldo.toLocaleString("es-CU")+" "+moneda : "Al día"}</strong></div>
        </div>`;
    }).join("");
}

function seleccionarClienteFiado(id) {
    const c = DB.buscarCliente(id); if (!c) return;
    // Verificar límite de crédito
    if (c.limiteCredito > 0) {
        const saldo = DB.saldoCliente(id);
        if (saldo >= c.limiteCredito) {
            alert(`🚫 ${c.nombre} ha alcanzado su límite de crédito (${c.limiteCredito.toLocaleString("es-CU")} CUP). Saldo actual: ${saldo.toLocaleString("es-CU")} CUP.`);
            cerrarSheetClientes(); return;
        }
        if (saldo >= c.limiteCredito * 0.9) {
            mostrarToast(`⚠️ ${c.nombre} está cerca de su límite de crédito`);
        }
    }
    // Detectar si viene del POS o de Movimientos
    const enPOS = !document.getElementById("pantallaCajaPOS").classList.contains("oculto") ||
                  document.getElementById("pantallaCajaPOS").classList.contains("activa");
    if (enPOS) {
        document.getElementById("posClienteId").value = id;
        const textoEl = document.getElementById("textoClientePOS");
        textoEl.className = "texto-prod-seleccionado";
        textoEl.innerText = `👤 ${c.nombre}`;
    } else {
        document.getElementById("movClienteId").value = id;
        const textoEl = document.getElementById("textoClienteSel");
        textoEl.className = "texto-prod-seleccionado";
        textoEl.innerText = `👤 ${c.nombre}`;
    }
    cerrarSheetClientes();
}

// ── Campo fiado en Movimientos ──
function actualizarCampoFiado() {
    const metodo = document.getElementById("movMetodoPago").value;
    const campo = document.getElementById("campoFiado");
    if (metodo === "fiado") {
        campo.classList.remove("oculto");
    } else {
        campo.classList.add("oculto");
        document.getElementById("movClienteId").value = "";
        document.getElementById("textoClienteSel").className = "texto-prod-placeholder";
        document.getElementById("textoClienteSel").innerText = "Toca para seleccionar cliente...";
    }
}

// ── Exportar clientes ──
function toggleMenuOpcionesClientes() { document.getElementById("menuOpcionesClientes").classList.toggle("oculto"); }

function exportarClientesExcel() {
    document.getElementById("menuOpcionesClientes").classList.add("oculto");
    const datos = DB.clientes.map(c => ({
        Nombre: c.nombre, Teléfono: c.telefono||"", Dirección: c.direccion||"",
        "Saldo pendiente": DB.saldoCliente(c.id), "Límite crédito": c.limiteCredito||0,
        Estado: RIESGO[DB.nivelRiesgo(c.id)], Observaciones: c.observaciones||""
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    XLSX.writeFile(wb, "clientes-arb.xlsx");
}

function exportarClientesPDF() {
    document.getElementById("menuOpcionesClientes").classList.add("oculto");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const cfg = DB.configuracion;
    doc.setFontSize(16);
    doc.text("INVENTARY ARB — Clientes — " + (cfg.nombreNegocio||"Mi Negocio"), 14, 15);
    doc.setFontSize(10);
    doc.text("Generado: " + new Date().toLocaleDateString("es-CU"), 14, 22);
    doc.autoTable({
        startY: 28,
        head: [["Nombre","Teléfono","Saldo","Límite","Estado"]],
        body: DB.clientes.map(c => [
            c.nombre, c.telefono||"—",
            DB.saldoCliente(c.id).toLocaleString("es-CU") + " " + (cfg.moneda||"CUP"),
            c.limiteCredito > 0 ? c.limiteCredito.toLocaleString("es-CU") : "Sin límite",
            RIESGO[DB.nivelRiesgo(c.id)]
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [245, 197, 66], textColor: [10,15,13] }
    });
    doc.save("clientes-arb.pdf");
}

// ═══════════════════════════════════════════════
// MÓDULO REPORTES
// ═══════════════════════════════════════════════
function cambiarVistaReporte(btn) {
    document.querySelectorAll("#pantallaReportes .chip-filtro").forEach(c => c.classList.remove("activo"));
    btn.classList.add("activo");
    vistaReporteActual = btn.dataset.vista;
    document.getElementById("rep-periodo-selector").classList.toggle("oculto", vistaReporteActual !== "periodo");
    document.getElementById("repComparacionBloque").classList.toggle("oculto", vistaReporteActual !== "mes");
    actualizarReporte();
}

function rangoReporte() {
    const ahora = new Date();
    if (vistaReporteActual === "dia") {
        const ini = new Date(); ini.setHours(0,0,0,0);
        const fin = new Date(); fin.setHours(23,59,59,999);
        return { inicio: ini, fin, etiqueta: "Hoy" };
    }
    if (vistaReporteActual === "mes") {
        const ini = new Date(); ini.setDate(1); ini.setHours(0,0,0,0);
        const fin = new Date(); fin.setHours(23,59,59,999);
        return { inicio: ini, fin, etiqueta: "Este mes" };
    }
    const ini = new Date(document.getElementById("repFechaInicio").value || ahora);
    ini.setHours(0,0,0,0);
    const fin = new Date(document.getElementById("repFechaFin").value || ahora);
    fin.setHours(23,59,59,999);
    return { inicio: ini, fin, etiqueta: ini.toLocaleDateString("es-CU") + " → " + fin.toLocaleDateString("es-CU") };
}

function actualizarReporte() {
    const { inicio, fin, etiqueta } = rangoReporte();
    const moneda = DB.configuracion.moneda || "CUP";
    document.getElementById("repSubtitulo").innerText = etiqueta;

    // Movimientos de salida en el rango
    const ventas = DB.movimientos.filter(m => m.tipo === "salida" && new Date(m.fecha) >= inicio && new Date(m.fecha) <= fin);
    let totalVentas = 0, totalCosto = 0, totalUnidades = 0;
    ventas.forEach(m => {
        totalVentas += (m.precioUnitario || 0) * (m.cantidad || 0);
        totalCosto += (typeof m.costoReal === "number" ? m.costoReal : 0) * (m.cantidad || 0);
        totalUnidades += m.cantidad || 0;
    });
    const gananciaBruta = totalVentas - totalCosto;
    const gastosRango = DB.gastosEnRango(inicio, fin).reduce((s, g) => s + g.monto, 0);
    const gananciaNeta = gananciaBruta - gastosRango;
    const margen = totalVentas > 0 ? Math.round((gananciaBruta / totalVentas) * 100) : 0;
    const ventaPromedio = ventas.length > 0 ? Math.round(totalVentas / ventas.length) : 0;
    const clientesActivos = new Set(ventas.filter(m => m.clienteId).map(m => m.clienteId)).size;

    // Cascada
    document.getElementById("repVentas").innerText = totalVentas.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("repCosto").innerText = totalCosto.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("repGananciaBruta").innerText = gananciaBruta.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("repGastos").innerText = gastosRango.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("repGananciaNeta").innerText = gananciaNeta.toLocaleString("es-CU") + " " + moneda;

    // Indicadores rápidos
    document.getElementById("repIndMargen").innerText = margen + "%";
    document.getElementById("repIndVentaPromedio").innerText = ventaPromedio.toLocaleString("es-CU");
    document.getElementById("repIndProductosVendidos").innerText = totalUnidades;
    document.getElementById("repIndClientesActivos").innerText = clientesActivos;

    // Métodos de pago
    const metodos = { efectivo:"💵 Efectivo", transfermovil:"📱 Transfermóvil", enzona:"💳 EnZona", transferencia:"🏦 Transferencia", fiado:"📦 Fiado", otros:"🧾 Otros" };
    const porMetodo = {};
    ventas.forEach(m => { const k = m.metodoPago || "otros"; porMetodo[k] = (porMetodo[k]||0) + (m.precioUnitario||0)*(m.cantidad||0); });
    const metEl = document.getElementById("repMetodosPago");
    const metKeys = Object.keys(porMetodo).sort((a,b) => porMetodo[b]-porMetodo[a]);
    metEl.innerHTML = metKeys.length === 0
        ? `<div class="cfg-row" style="cursor:default;"><div class="cfg-row-body"><span class="cfg-row-sub">Sin ventas en este período</span></div></div>`
        : metKeys.map((k,i) => `
            <div class="cfg-row" style="cursor:default;">
                <div class="cfg-row-body"><span class="cfg-row-titulo">${metodos[k]||k}</span></div>
                <strong style="font-family:'Syne',Arial,sans-serif;color:var(--accent);">${porMetodo[k].toLocaleString("es-CU")} ${moneda}</strong>
            </div>${i<metKeys.length-1?'<div class="cfg-row-sep"></div>':''}`).join("");

    // Productos más rentables (ganancia real FIFO)
    const porProductoGanancia = {}, porProductoCantidad = {}, porProductoNombre = {};
    ventas.forEach(m => {
        const p = DB.buscarProducto(m.productoId);
        const nombre = p ? p.nombre : "Eliminado";
        const id = m.productoId;
        const costoUnit = typeof m.costoReal === "number" ? m.costoReal : 0;
        const ganancia = ((m.precioUnitario||0) - costoUnit) * (m.cantidad||0);
        porProductoGanancia[id] = (porProductoGanancia[id]||0) + ganancia;
        porProductoCantidad[id] = (porProductoCantidad[id]||0) + (m.cantidad||0);
        porProductoNombre[id] = nombre;
    });

    const topRentables = Object.keys(porProductoGanancia).sort((a,b) => porProductoGanancia[b]-porProductoGanancia[a]).slice(0,5);
    const rentEl = document.getElementById("repTopRentables");
    rentEl.innerHTML = topRentables.length === 0
        ? `<div class="cfg-row" style="cursor:default;"><div class="cfg-row-body"><span class="cfg-row-sub">Sin datos</span></div></div>`
        : topRentables.map((id,i) => `
            <div class="cfg-row" style="cursor:default;">
                <div class="cfg-row-body"><span class="cfg-row-titulo">${i===0?"🏆 ":""}${porProductoNombre[id]}</span></div>
                <strong style="font-family:'Syne',Arial,sans-serif;color:var(--accent);">${porProductoGanancia[id].toLocaleString("es-CU")} ${moneda}</strong>
            </div>${i<topRentables.length-1?'<div class="cfg-row-sep"></div>':''}`).join("");

    const topVendidos = Object.keys(porProductoCantidad).sort((a,b) => porProductoCantidad[b]-porProductoCantidad[a]).slice(0,5);
    const vendEl = document.getElementById("repTopVendidos");
    vendEl.innerHTML = topVendidos.length === 0
        ? `<div class="cfg-row" style="cursor:default;"><div class="cfg-row-body"><span class="cfg-row-sub">Sin datos</span></div></div>`
        : topVendidos.map((id,i) => `
            <div class="cfg-row" style="cursor:default;">
                <div class="cfg-row-body"><span class="cfg-row-titulo">${porProductoNombre[id]}</span></div>
                <strong style="font-family:'Syne',Arial,sans-serif;color:var(--text);">${porProductoCantidad[id]} uds.</strong>
            </div>${i<topVendidos.length-1?'<div class="cfg-row-sep"></div>':''}`).join("");

    // Productos sin movimiento
    const hoy = new Date();
    const idsConVenta = new Set(DB.movimientos.filter(m=>m.tipo==="salida").map(m=>m.productoId));
    const sinMov = DB.productos.map(p => {
        const ultMov = DB.movimientos.filter(m => m.productoId === p.id && m.tipo==="salida").sort((a,b)=>new Date(b.fecha)-new Date(a.fecha))[0];
        const dias = ultMov ? Math.floor((hoy-new Date(ultMov.fecha))/(1000*60*60*24)) : null;
        return { p, dias };
    }).filter(({p,dias}) => !idsConVenta.has(p.id) || (dias !== null && dias > 15))
      .sort((a,b) => (b.dias||999) - (a.dias||999)).slice(0,5);

    const sinMovEl = document.getElementById("repSinMovimiento");
    sinMovEl.innerHTML = sinMov.length === 0
        ? `<div class="cfg-row" style="cursor:default;"><div class="cfg-row-body"><span class="cfg-row-titulo" style="color:var(--accent)">✅ Todos los productos tienen movimiento reciente</span></div></div>`
        : sinMov.map(({p,dias},i) => `
            <div class="cfg-row" style="cursor:default;">
                <div class="cfg-row-body"><span class="cfg-row-titulo">${p.nombre}</span><span class="cfg-row-sub">${dias!==null?dias+" días sin venta":"Sin ventas registradas"}</span></div>
                <span style="color:var(--warn);font-size:13px;">⚠️</span>
            </div>${i<sinMov.length-1?'<div class="cfg-row-sep"></div>':''}`).join("");

    // Clientes pendientes
    const clientesCobro = DB.clientes.map(c=>({c, saldo:DB.saldoCliente(c.id)})).filter(({saldo})=>saldo>0).sort((a,b)=>b.saldo-a.saldo);
    const cliEl = document.getElementById("repClientesPendientes");
    cliEl.innerHTML = clientesCobro.length === 0
        ? `<div class="cfg-row" style="cursor:default;"><div class="cfg-row-body"><span class="cfg-row-titulo" style="color:var(--accent)">✅ Sin cuentas pendientes</span></div></div>`
        : clientesCobro.map(({c,saldo},i) => `
            <div class="cfg-row" style="cursor:default;">
                <div class="cfg-row-body"><span class="cfg-row-titulo">👤 ${c.nombre}</span></div>
                <strong style="font-family:'Syne',Arial,sans-serif;color:var(--warn);">${saldo.toLocaleString("es-CU")} ${moneda}</strong>
            </div>${i<clientesCobro.length-1?'<div class="cfg-row-sep"></div>':''}`).join("");

    // Valor del inventario
    const capital = DB.productos.reduce((s,p)=>s+(p.compra||0)*(p.cantidad||0),0);
    const valorVenta = DB.productos.reduce((s,p)=>s+(p.venta||0)*(p.cantidad||0),0);
    document.getElementById("repCapital").innerText = capital.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("repValorVenta").innerText = valorVenta.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("repGananciaPotencial").innerText = (valorVenta-capital).toLocaleString("es-CU") + " " + moneda;

    // Comparación mes anterior (solo en vista mes)
    if (vistaReporteActual === "mes") {
        const iniAnt = new Date(); iniAnt.setMonth(iniAnt.getMonth()-1); iniAnt.setDate(1); iniAnt.setHours(0,0,0,0);
        const finAnt = new Date(); finAnt.setDate(0); finAnt.setHours(23,59,59,999);
        const ventasAnt = DB.movimientos.filter(m=>m.tipo==="salida"&&new Date(m.fecha)>=iniAnt&&new Date(m.fecha)<=finAnt);
        const totalVentasAnt = ventasAnt.reduce((s,m)=>s+(m.precioUnitario||0)*(m.cantidad||0),0);
        const costoAnt = ventasAnt.reduce((s,m)=>s+(typeof m.costoReal==="number"?m.costoReal:0)*(m.cantidad||0),0);
        const gananciaAnt = totalVentasAnt - costoAnt;
        const variacion = totalVentasAnt > 0 ? Math.round(((totalVentas-totalVentasAnt)/totalVentasAnt)*100) : null;
        document.getElementById("repVentasAnterior").innerText = totalVentasAnt.toLocaleString("es-CU") + " " + moneda;
        document.getElementById("repGananciaAnterior").innerText = gananciaAnt.toLocaleString("es-CU") + " " + moneda;
        document.getElementById("repVariacion").innerText = variacion !== null ? (variacion >= 0 ? "+" : "") + variacion + "%" : "Sin datos";
        document.getElementById("repVariacion").style.color = variacion >= 0 ? "var(--accent)" : "var(--warn)";
    }

    // Gastos por categoría
    const gastosCateg = {};
    DB.gastosEnRango(inicio,fin).forEach(g=>{ gastosCateg[g.categoria]=(gastosCateg[g.categoria]||0)+g.monto; });
    const categKeys = Object.keys(gastosCateg).sort((a,b)=>gastosCateg[b]-gastosCateg[a]);
    const gCatEl = document.getElementById("repGastosCategorias");
    gCatEl.innerHTML = categKeys.length === 0
        ? `<div class="cfg-row" style="cursor:default;"><div class="cfg-row-body"><span class="cfg-row-sub">Sin gastos en este período</span></div></div>`
        : categKeys.map((k,i)=>{
            const cat = CATEGORIAS_GASTO[k]||{nombre:k,icono:"🧾"};
            return `<div class="cfg-row" style="cursor:default;">
                <div class="cfg-row-body"><span class="cfg-row-titulo">${cat.icono} ${cat.nombre}</span></div>
                <strong style="font-family:'Syne',Arial,sans-serif;color:var(--warn);">${gastosCateg[k].toLocaleString("es-CU")} ${moneda}</strong>
            </div>${i<categKeys.length-1?'<div class="cfg-row-sep"></div>':''}`;
        }).join("");
}

function compartirReporteWhatsApp() {
    const { etiqueta } = rangoReporte();
    const moneda = DB.configuracion.moneda || "CUP";
    const negocio = DB.configuracion.nombreNegocio || "Mi Negocio";
    const ventas = document.getElementById("repVentas").innerText;
    const gBruta = document.getElementById("repGananciaBruta").innerText;
    const gastos = document.getElementById("repGastos").innerText;
    const gNeta = document.getElementById("repGananciaNeta").innerText;
    const txt = `📊 *INVENTARY ARB — ${negocio}*\n📅 ${etiqueta}\n\n💰 Ventas: ${ventas}\n📦 Ganancia bruta: ${gBruta}\n🧾 Gastos: ${gastos}\n📈 *Ganancia neta: ${gNeta}*\n\n_Generado con INVENTARY ARB_`;
    window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
}

function exportarReportePDF() {
    const { etiqueta } = rangoReporte();
    const moneda = DB.configuracion.moneda || "CUP";
    const negocio = DB.configuracion.nombreNegocio || "Mi Negocio";
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`INVENTARY ARB — Reporte — ${negocio}`, 14, 15);
    doc.setFontSize(11);
    doc.text(`Período: ${etiqueta}`, 14, 23);
    doc.setFontSize(10);
    let y = 32;
    const add = (label, val, color) => {
        doc.setTextColor(color||"#000");
        doc.text(label, 14, y);
        doc.text(val, 140, y);
        y += 7;
    };
    add("Ventas totales:", document.getElementById("repVentas").innerText);
    add("Costo FIFO real:", document.getElementById("repCosto").innerText);
    add("Ganancia bruta:", document.getElementById("repGananciaBruta").innerText);
    add("Gastos operativos:", document.getElementById("repGastos").innerText);
    doc.setFontSize(12);
    add("GANANCIA NETA:", document.getElementById("repGananciaNeta").innerText);
    doc.save(`reporte-${etiqueta.replace(/[^a-zA-Z0-9]/g,"-")}.pdf`);
}

// ═══════════════════════════════════════════════
// MOTOR FISCAL — ONAT TCP
// ═══════════════════════════════════════════════

// Tabla de configuración fiscal (editable por el usuario, no hardcoded en cálculos)
function getCfgFiscal() {
    const cfg = DB.configuracion.fiscal || {};
    return {
        tasa0114022: cfg.tasa0114022 ?? 10,        // % sobre ventas
        tasa0510122: cfg.tasa0510122 ?? 5,          // % sobre ingresos - mín.exento
        minExentoMensual: cfg.minExentoMensual ?? 3260,
        minExentoAnual: cfg.minExentoAnual ?? 39120,
        salarioEmpleados: cfg.salarioEmpleados ?? 0, // total mensual nómina
        baseContribTitular: cfg.baseContribTitular ?? 800, // base 0820132
        tieneEmpleados: (cfg.salarioEmpleados || 0) > 0,
        // Escala 0520522 (retención empleados)
        escala0520522: [
            { desde: 0, hasta: 3260, tasa: 0 },
            { desde: 3260, hasta: 9510, tasa: 3 },
            { desde: 9510, hasta: 15000, tasa: 5 },
            { desde: 15000, hasta: 20000, tasa: 7.5 },
            { desde: 20000, hasta: 25000, tasa: 10 },
            { desde: 25000, hasta: 30000, tasa: 15 },
            { desde: 30000, hasta: Infinity, tasa: 20 }
        ],
        // Escala 0820232 (contribución especial SS empleados)
        escala0820232: [
            { desde: 0, hasta: 15000, tasa: 5 },
            { desde: 15000, hasta: Infinity, tasa: 10 }
        ]
    };
}

// Calcula impuesto según escala progresiva
function calcularEscala(ingreso, escala) {
    let total = 0;
    for (const tramo of escala) {
        if (ingreso <= tramo.desde) break;
        const base = Math.min(ingreso, tramo.hasta) - tramo.desde;
        total += base * (tramo.tasa / 100);
    }
    return total;
}

// MOTOR PRINCIPAL: calcula todos los tributos para un mes/año dados con ingresos específicos
function calcularTributos(ingresosMes, gastosMes, mes, anio) {
    const cfg = getCfgFiscal();
    const moneda = DB.configuracion.moneda || "CUP";
    const resultados = {};

    // 0114022 — Impuesto sobre Ventas (mensual, día 20)
    const imp0114022 = ingresosMes * (cfg.tasa0114022 / 100);
    resultados["0114022"] = {
        codigo: "0114022", nombre: "Impuesto sobre Ventas",
        importe: imp0114022, frecuencia: "mensual", diaLimite: 20,
        pasos: [
            { label: "Ventas del mes", valor: ingresosMes },
            { label: `× ${cfg.tasa0114022}%`, valor: null },
            { label: "Impuesto a pagar", valor: imp0114022, destacado: true }
        ],
        baseLegal: "Tributo 0114022: 10% de los ingresos totales por ventas/servicios del mes.",
        esAplicable: true
    };

    // 0510122 — Ingresos Personales aporte mensual (día 20)
    const baseImp0510122 = Math.max(0, ingresosMes - cfg.minExentoMensual);
    const imp0510122 = baseImp0510122 * (cfg.tasa0510122 / 100);
    resultados["0510122"] = {
        codigo: "0510122", nombre: "Ingresos Personales — Aporte mensual",
        importe: imp0510122, frecuencia: "mensual", diaLimite: 20,
        pasos: [
            { label: "Ingresos del mes", valor: ingresosMes },
            { label: `− Mínimo exento`, valor: cfg.minExentoMensual },
            { label: "= Base imponible", valor: baseImp0510122 },
            { label: `× ${cfg.tasa0510122}%`, valor: null },
            { label: "Impuesto a pagar", valor: imp0510122, destacado: true }
        ],
        baseLegal: `Tributo 0510122: 5% de los ingresos del mes después de descontar ${cfg.minExentoMensual.toLocaleString("es-CU")} CUP de mínimo exento mensual.`,
        esAplicable: true
    };

    // 0520522 — Retención a empleados (mensual, primeros 10 días hábiles)
    const sal = cfg.salarioEmpleados;
    const imp0520522 = cfg.tieneEmpleados ? calcularEscala(sal, cfg.escala0520522) : 0;
    resultados["0520522"] = {
        codigo: "0520522", nombre: "Retención Empleados — Ingresos Personales",
        importe: imp0520522, frecuencia: "mensual", diaLimite: 10,
        pasos: [
            { label: "Salario total empleados", valor: sal },
            { label: "Escala progresiva aplicada", valor: null },
            { label: "Retención total", valor: imp0520522, destacado: true }
        ],
        baseLegal: "Tributo 0520522: Retención mensual del impuesto sobre ingresos personales de empleados según escala progresiva (0% hasta 3,260 CUP; 3% de 3,260 a 9,510; 5% de 9,510 a 15,000; etc.).",
        esAplicable: cfg.tieneEmpleados,
        escala: cfg.escala0520522, ingresoBase: sal
    };

    // 0810132 — Contribución Seguridad Social empleados (mensual, primeros 10 días)
    const imp0810132 = cfg.tieneEmpleados ? sal * 0.125 : 0; // 12.5% al Estado
    resultados["0810132"] = {
        codigo: "0810132", nombre: "Contribución Seguridad Social — Empleados",
        importe: imp0810132, frecuencia: "mensual", diaLimite: 10,
        pasos: [
            { label: "Salario total empleados", valor: sal },
            { label: "× 12.5% (14% − 1.5% subsidio)", valor: null },
            { label: "Aporte al Estado", valor: imp0810132, destacado: true }
        ],
        baseLegal: "Tributo 0810132: El titular asume 14% de SS de sus empleados, retiene 1.5% para subsidios y aporta el 12.5% restante al Estado en los primeros 10 días hábiles del mes.",
        esAplicable: cfg.tieneEmpleados
    };

    // 0820232 — Contribución Especial SS empleados (mensual, primeros 10 días)
    const imp0820232 = cfg.tieneEmpleados ? calcularEscala(sal, cfg.escala0820232) : 0;
    resultados["0820232"] = {
        codigo: "0820232", nombre: "Contribución Especial SS — Retención Empleados",
        importe: imp0820232, frecuencia: "mensual", diaLimite: 10,
        pasos: [
            { label: "Salario total empleados", valor: sal },
            { label: "Hasta 15,000: 5% / Exceso: 10%", valor: null },
            { label: "Retención total", valor: imp0820232, destacado: true }
        ],
        baseLegal: "Tributo 0820232: Retención mensual de la Contribución Especial a la Seguridad Social de empleados. Hasta 15,000 CUP: 5%; exceso: 10%. Se retiene del salario del empleado.",
        esAplicable: cfg.tieneEmpleados
    };

    // 0610322 — Fuerza de Trabajo (trimestral, día 20 mes siguiente)
    const esTrimestre = [2,5,8,11].includes(mes); // mar, jun, sep, dic
    const salTrimestreEst = sal * 3;
    const imp0610322 = cfg.tieneEmpleados ? salTrimestreEst * 0.05 : 0;
    resultados["0610322"] = {
        codigo: "0610322", nombre: "Fuerza de Trabajo — Trimestral",
        importe: esTrimestre && cfg.tieneEmpleados ? imp0610322 : 0,
        frecuencia: "trimestral", diaLimite: 20,
        pasos: [
            { label: "Salario trimestral estimado", valor: salTrimestreEst },
            { label: "× 5%", valor: null },
            { label: "Impuesto trimestral", valor: imp0610322, destacado: true }
        ],
        baseLegal: "Tributo 0610322: 5% del total de remuneraciones pagadas a empleados en el trimestre. Se paga el día 20 del mes siguiente al cierre del trimestre.",
        esAplicable: cfg.tieneEmpleados, esTrimestre
    };

    // 0820132 — Contribución Especial SS titular (trimestral)
    // Primer trimestre = 800, resto = 1,200
    const trimestre = Math.floor(mes / 3); // 0,1,2,3
    const imp0820132 = trimestre === 0 ? 800 : 1200;
    resultados["0820132"] = {
        codigo: "0820132", nombre: "Contribución Especial SS — Titular",
        importe: esTrimestre ? imp0820132 : 0,
        frecuencia: "trimestral", diaLimite: 20,
        pasos: [
            { label: "Base de contribución seleccionada", valor: cfg.baseContribTitular },
            { label: "× 20% trimestral", valor: null },
            { label: trimestre === 0 ? "Primer trimestre (ajustado)" : "Trimestre regular", valor: imp0820132, destacado: true }
        ],
        baseLegal: "Tributo 0820132: 20% de la base de contribución seleccionada en la afiliación al INASS, pagado trimestralmente.",
        esAplicable: true, esTrimestre
    };

    // 0730122 — Impuesto sobre Documentos (enero solamente, 30 CUP fijo)
    resultados["0730122"] = {
        codigo: "0730122", nombre: "Impuesto sobre Documentos",
        importe: mes === 0 ? 30 : 0, frecuencia: "anual", diaLimite: 20,
        pasos: [
            { label: "Importe fijo anual", valor: 30, destacado: true }
        ],
        baseLegal: "Tributo 0730122: 30 CUP fijos, pagaderos en enero de cada año.",
        esAplicable: mes === 0
    };

    // 0530222 — Declaración Jurada anual (30 abril año siguiente)
    // Calculamos el estimado acumulado del año
    const iniAnio = new Date(anio, 0, 1);
    const finAnio = new Date(anio, mes + 1, 0, 23, 59, 59);
    const ingresosAnio = DB.movimientos
        .filter(m => m.tipo === "salida" && new Date(m.fecha) >= iniAnio && new Date(m.fecha) <= finAnio)
        .reduce((s, m) => s + (m.precioUnitario || 0) * (m.cantidad || 0), 0);
    const gastosAnio = DB.gastosEnRango(iniAnio, finAnio).reduce((s, g) => s + g.monto, 0);
    const baseAnual = Math.max(0, ingresosAnio - cfg.minExentoAnual - gastosAnio);
    // Escala progresiva simplificada del impuesto anual (legislación cubana TCP)
    const escalaAnual = [
        { desde: 0, hasta: 10000, tasa: 0 },
        { desde: 10000, hasta: 20000, tasa: 15 },
        { desde: 20000, hasta: 30000, tasa: 20 },
        { desde: 30000, hasta: 50000, tasa: 30 },
        { desde: 50000, hasta: Infinity, tasa: 35 }
    ];
    const impAnual = calcularEscala(baseAnual, escalaAnual);
    const pagadosEnMeses = (resultados["0510122"].importe) * (mes + 1); // estimado
    const saldoAnual = Math.max(0, impAnual - pagadosEnMeses);
    resultados["0530222"] = {
        codigo: "0530222", nombre: "Declaración Jurada — Ingresos Personales",
        importe: saldoAnual, frecuencia: "anual", diaLimite: 30,
        mesVencimiento: 3, // abril
        pasos: [
            { label: `Ingresos acumulados (${anio})`, valor: ingresosAnio },
            { label: "− Mínimo exento anual", valor: cfg.minExentoAnual },
            { label: "− Gastos deducibles", valor: gastosAnio },
            { label: "= Base imponible", valor: baseAnual },
            { label: "× Escala progresiva", valor: null },
            { label: "Impuesto calculado", valor: impAnual },
            { label: "− Ya pagado en 0510122 (estimado)", valor: pagadosEnMeses },
            { label: "Saldo estimado a pagar", valor: saldoAnual, destacado: true }
        ],
        baseLegal: "Tributo 0530222: Declaración jurada anual. Descuenta mínimo exento 39,120 CUP y 100% de gastos documentados. Bonificación 5% si paga antes del 28 de febrero. Vence el 30 de abril del año siguiente.",
        esAplicable: true
    };

    return resultados;
}

// Obtiene ingresos del mes actual de la app
function ingresosDelMes(mes, anio) {
    const inicio = new Date(anio, mes, 1);
    const fin = new Date(anio, mes + 1, 0, 23, 59, 59);
    return DB.movimientos
        .filter(m => m.tipo === "salida" && new Date(m.fecha) >= inicio && new Date(m.fecha) <= fin)
        .reduce((s, m) => s + (m.precioUnitario || 0) * (m.cantidad || 0), 0);
}

function gastosDelMes(mes, anio) {
    const inicio = new Date(anio, mes, 1);
    const fin = new Date(anio, mes + 1, 0, 23, 59, 59);
    return DB.gastosEnRango(inicio, fin).reduce((s, g) => s + g.monto, 0);
}

// ── Panel principal ──
function renderONATPanel() {
    const ahora = new Date();
    const mes = ahora.getMonth();
    const anio = ahora.getFullYear();
    const moneda = DB.configuracion.moneda || "CUP";
    const ingresos = ingresosDelMes(mes, anio);
    const gastos = gastosDelMes(mes, anio);
    const tributos = calcularTributos(ingresos, gastos, mes, anio);

    const totalTributos = Object.values(tributos).filter(t => t.esAplicable).reduce((s, t) => s + t.importe, 0);
    const utilidad = ingresos - gastos;
    const resultado = utilidad - totalTributos;

    document.getElementById("onatVentasMes").innerText = ingresos.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("onatGastosDeducibles").innerText = gastos.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("onatUtilidadMes").innerText = utilidad.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("onatTributosMes").innerText = totalTributos.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("onatResultadoNeto").innerText = resultado.toLocaleString("es-CU") + " " + moneda;

    // Estado de salud fiscal
    const pagos = DB.configuracion.onatPagos || {};
    const claveMes = `${anio}-${mes}`;
    const pendientes = Object.values(tributos).filter(t => t.esAplicable && t.importe > 0 && !pagos[`${claveMes}-${t.codigo}`]);
    const vencidos = pendientes.filter(t => {
        const limite = new Date(anio, mes, t.diaLimite, 23, 59, 59);
        return ahora > limite;
    });

    const saludEl = document.getElementById("onatSaludFiscal");
    if (vencidos.length > 0) {
        saludEl.innerHTML = `<div class="onat-salud rojo">🔴 ${vencidos.length} tributo${vencidos.length>1?'s':''} vencido${vencidos.length>1?'s':''} — Atiéndelo urgente</div>`;
    } else if (pendientes.length > 0) {
        saludEl.innerHTML = `<div class="onat-salud amarillo">🟡 ${pendientes.length} tributo${pendientes.length>1?'s':''} pendiente${pendientes.length>1?'s':''} este mes</div>`;
    } else {
        saludEl.innerHTML = `<div class="onat-salud verde">🟢 Estado fiscal al día — Sin pendientes</div>`;
    }

    // Verificación automática
    const alertasVerif = [];
    const sinMetodoPago = DB.movimientos.filter(m => m.tipo === "salida" && !m.metodoPago);
    if (sinMetodoPago.length > 0) alertasVerif.push(`⚠️ ${sinMetodoPago.length} movimiento${sinMetodoPago.length>1?'s':''} sin método de pago`);
    const sinCosto = DB.productos.filter(p => !p.compra || p.compra === 0);
    if (sinCosto.length > 0) alertasVerif.push(`⚠️ ${sinCosto.length} producto${sinCosto.length>1?'s':''} sin costo registrado`);
    const clientesDeuda = DB.clientes.filter(c => DB.nivelRiesgo(c.id) === "rojo");
    if (clientesDeuda.length > 0) alertasVerif.push(`⚠️ ${clientesDeuda.length} cliente${clientesDeuda.length>1?'s':''} con deuda vencida`);

    const verifEl = document.getElementById("onatVerificacion");
    if (alertasVerif.length > 0) {
        verifEl.innerHTML = `<div class="onat-verif">${alertasVerif.map(a=>`<div class="onat-verif-item">${a}</div>`).join("")}</div>`;
    } else {
        verifEl.innerHTML = `<div class="onat-verif"><div class="onat-verif-item ok">✅ Datos verificados — Sin inconsistencias detectadas</div></div>`;
    }

    // Próximos vencimientos
    const proxEl = document.getElementById("onatProximosVencimientos");
    const vencimientos = Object.values(tributos)
        .filter(t => t.esAplicable && t.importe > 0)
        .sort((a, b) => a.diaLimite - b.diaLimite)
        .slice(0, 5);
    proxEl.innerHTML = vencimientos.map((t, i) => {
        const limite = new Date(anio, mes, t.diaLimite);
        const diasRestantes = Math.ceil((limite - ahora) / (1000*60*60*24));
        const estadoIcon = diasRestantes < 0 ? "🔴" : diasRestantes <= 3 ? "🟡" : "🟢";
        const estadoTxt = diasRestantes < 0 ? `Vencido hace ${Math.abs(diasRestantes)} días` : diasRestantes === 0 ? "Vence hoy" : `${diasRestantes} días`;
        return `<div class="cfg-row" style="cursor:pointer;" onclick="abrirDetalleTributo('${t.codigo}')">
            <div class="cfg-row-body">
                <span class="cfg-row-titulo">${estadoIcon} ${t.codigo} — ${t.nombre}</span>
                <span class="cfg-row-sub">Vence día ${t.diaLimite} · ${estadoTxt}</span>
            </div>
            <strong style="font-family:'Syne',Arial,sans-serif;color:var(--warn);font-size:13px;">${t.importe.toLocaleString("es-CU")} ${moneda}</strong>
        </div>${i < vencimientos.length-1 ? '<div class="cfg-row-sep"></div>' : ''}`;
    }).join("");
}

// ── Centro de Tributos ──
function renderTributos() {
    const mes = parseInt(document.getElementById("onatMesTributo").value);
    const anio = parseInt(document.getElementById("onatAnioTributo").value);
    const origen = document.getElementById("onatOrigenDatos").value;
    const moneda = DB.configuracion.moneda || "CUP";

    document.getElementById("onatAjusteManualBloque").classList.toggle("oculto", origen !== "manual");

    let ingresos, gastos;
    if (origen === "manual") {
        ingresos = Number(document.getElementById("onatIngresosManual").value) || 0;
        gastos = gastosDelMes(mes, anio);
    } else {
        ingresos = ingresosDelMes(mes, anio);
        gastos = gastosDelMes(mes, anio);
    }

    const tributos = calcularTributos(ingresos, gastos, mes, anio);
    const pagos = DB.configuracion.onatPagos || {};
    const claveMes = `${anio}-${mes}`;
    const lista = document.getElementById("listaTributos");
    const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

    lista.innerHTML = Object.values(tributos).map(t => {
        const clave = `${claveMes}-${t.codigo}`;
        const pagado = pagos[clave];
        const esActivo = t.esAplicable && t.importe > 0;
        const colorEstado = pagado ? "var(--accent)" : esActivo ? "var(--warn)" : "var(--text3)";
        const iconEstado = pagado ? "✅" : esActivo ? "⏳" : "—";

        return `
        <div class="onat-tributo-card ${!esActivo ? 'onat-inactivo' : ''}" onclick="${esActivo ? `abrirDetalleTributo('${t.codigo}')` : ''}">
            <div class="onat-tributo-header">
                <div>
                    <div class="onat-tributo-codigo">${t.codigo}</div>
                    <div class="onat-tributo-nombre">${t.nombre}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-family:'Syne',Arial,sans-serif;font-size:17px;font-weight:700;color:${colorEstado};">
                        ${esActivo ? t.importe.toLocaleString("es-CU") + " " + moneda : "No aplica"}
                    </div>
                    <div style="font-size:11px;color:var(--text2);">${iconEstado} ${pagado ? "Pagado el " + new Date(pagado.fecha).toLocaleDateString("es-CU") : esActivo ? "Pendiente" : t.frecuencia}</div>
                </div>
            </div>
            ${esActivo ? `
            <div class="onat-tributo-footer">
                <span style="font-size:11px;color:var(--text2);">Vence día ${t.diaLimite} · ${MESES[mes]} ${anio}</span>
                <div style="display:flex;gap:8px;">
                    <button class="onat-btn-small" onclick="event.stopPropagation();abrirDetalleTributo('${t.codigo}')">Ver cálculo</button>
                    ${!pagado ? `<button class="onat-btn-small accent" onclick="event.stopPropagation();marcarPagado('${t.codigo}','${claveMes}')">Marcar pagado</button>` : ''}
                </div>
            </div>` : ''}
        </div>`;
    }).join("");
}

// ── Detalle de tributo ──
function abrirDetalleTributo(codigo) {
    const mes = parseInt(document.getElementById("onatMesTributo")?.value ?? new Date().getMonth());
    const anio = parseInt(document.getElementById("onatAnioTributo")?.value ?? new Date().getFullYear());
    const origen = document.getElementById("onatOrigenDatos")?.value || "automatico";
    const ingresos = origen === "manual" ? (Number(document.getElementById("onatIngresosManual")?.value) || 0) : ingresosDelMes(mes, anio);
    const gastos = gastosDelMes(mes, anio);
    const tributos = calcularTributos(ingresos, gastos, mes, anio);
    const t = tributos[codigo]; if (!t) return;
    const moneda = DB.configuracion.moneda || "CUP";
    const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

    mostrarPantalla("pantallaTributoDetalle");
    document.getElementById("btnFlotante").classList.add("ocultar-boton");
    document.getElementById("tribDetCodigo").innerText = t.codigo;
    document.getElementById("tribDetNombre").innerText = t.nombre;

    const pagos = DB.configuracion.onatPagos || {};
    const clave = `${anio}-${mes}-${codigo}`;
    const pagado = pagos[clave];

    document.getElementById("tribDetContenido").innerHTML = `
        <!-- Cálculo paso a paso -->
        <div class="cfg-grupo-label" style="padding-top:14px;">¿CÓMO SE CALCULA?</div>
        <div class="dashfin-cascada" style="margin:0 20px 14px;">
            ${t.pasos.map(p => p.valor !== null ? `
            <div class="dashfin-row ${p.destacado ? 'dashfin-total' : ''}">
                <span>${p.label}</span>
                <strong ${p.destacado ? `style="color:var(--accent);font-size:18px;"` : ''}>${p.valor.toLocaleString("es-CU")} ${p.valor !== null ? moneda : ''}</strong>
            </div>` : `<div class="dashfin-sep" style="border-style:dashed;margin:4px 0;"></div>
            <div style="font-size:12px;color:var(--text2);text-align:center;padding:4px 0;">${p.label}</div>
            <div class="dashfin-sep" style="border-style:dashed;margin:4px 0;"></div>`).join("")}
        </div>

        <!-- Base legal -->
        <div class="cfg-grupo-label">BASE LEGAL</div>
        <div class="cfg-info-box" style="margin:0 20px 14px;">
            <span>📖</span>
            <p>${t.baseLegal}</p>
        </div>

        <!-- Fecha límite -->
        <div class="cfg-grupo-label">FECHA LÍMITE</div>
        <div class="cfg-grupo" style="margin:0 20px 14px;">
            <div class="cfg-row" style="cursor:default;">
                <div class="cfg-row-body">
                    <span class="cfg-row-titulo">Vencimiento</span>
                    <span class="cfg-row-sub">Día ${t.diaLimite} de ${MESES[mes]} ${anio}</span>
                </div>
            </div>
        </div>

        <!-- Estado de pago -->
        <div class="cfg-grupo-label">ESTADO DE PAGO</div>
        <div class="cfg-grupo" style="margin:0 20px 14px;">
            ${pagado ? `
            <div class="cfg-row" style="cursor:default;">
                <div class="cfg-row-body">
                    <span class="cfg-row-titulo" style="color:var(--accent);">✅ Pagado</span>
                    <span class="cfg-row-sub">Fecha: ${new Date(pagado.fecha).toLocaleDateString("es-CU")} · Recibo: ${pagado.recibo || "—"} · ${pagado.canal || "—"}</span>
                </div>
            </div>` : `
            <div class="cfg-row" style="cursor:default;">
                <div class="cfg-row-body"><span class="cfg-row-titulo" style="color:var(--warn);">⏳ Pendiente de pago</span></div>
            </div>`}
        </div>

        ${!pagado && t.esAplicable && t.importe > 0 ? `
        <div style="padding:0 20px 14px;">
            <label style="font-size:12px;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;">Registrar pago</label>
            <input type="date" id="pagoFecha" value="${new Date().toISOString().slice(0,10)}" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text);margin:8px 0;box-sizing:border-box;">
            <input type="text" id="pagoRecibo" placeholder="Número de recibo (opcional)" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text);margin-bottom:8px;box-sizing:border-box;">
            <select id="pagoCanal" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text);margin-bottom:12px;box-sizing:border-box;">
                <option value="Transfermóvil">📱 Transfermóvil</option>
                <option value="EnZona">💳 EnZona</option>
                <option value="Banco">🏦 Banco (ventanilla)</option>
                <option value="Efectivo">💵 Efectivo</option>
            </select>
            <button onclick="registrarPagoTributo('${codigo}','${clave}')" style="width:100%;padding:15px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#0a0f0d;border:none;border-radius:14px;font-size:16px;font-weight:700;font-family:'Syne',Arial,sans-serif;cursor:pointer;">✅ Confirmar Pago</button>
        </div>` : ''}
        <div style="height:40px;"></div>
    `;
}

function marcarPagado(codigo, claveMes) {
    abrirDetalleTributo(codigo);
}

function registrarPagoTributo(codigo, clave) {
    const fecha = document.getElementById("pagoFecha").value;
    const recibo = document.getElementById("pagoRecibo").value;
    const canal = document.getElementById("pagoCanal").value;
    if (!DB.configuracion.onatPagos) DB.configuracion.onatPagos = {};
    DB.configuracion.onatPagos[clave] = { fecha: new Date(fecha).toISOString(), recibo, canal };
    DB.guardar();
    mostrarToast("✅ Pago registrado");
    volverONAT();
    renderTributos();
}

// ── Calendario Fiscal ──
function renderCalendarioFiscal() {
    const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const anio = 2026;
    const ahora = new Date();
    const pagos = DB.configuracion.onatPagos || {};
    const moneda = DB.configuracion.moneda || "CUP";
    const el = document.getElementById("calendarioFiscal");

    el.innerHTML = MESES.map((nombreMes, mes) => {
        const ingresos = ingresosDelMes(mes, anio);
        const gastos = gastosDelMes(mes, anio);
        const tributos = calcularTributos(ingresos, gastos, mes, anio);
        const aplicables = Object.values(tributos).filter(t => t.esAplicable && t.importe > 0);
        const claveMes = `${anio}-${mes}`;

        const totalMes = aplicables.reduce((s,t) => s + t.importe, 0);
        const pagados = aplicables.filter(t => pagos[`${claveMes}-${t.codigo}`]);
        const estadoMes = pagados.length === aplicables.length ? "🟢" : aplicables.some(t => {
            const lim = new Date(anio, mes, t.diaLimite);
            return ahora > lim && !pagos[`${claveMes}-${t.codigo}`];
        }) ? "🔴" : "🟡";

        return `
        <div class="onat-cal-mes">
            <div class="onat-cal-header">
                <span class="onat-cal-nombre">${estadoMes} ${nombreMes} ${anio}</span>
                <span class="onat-cal-total">${totalMes.toLocaleString("es-CU")} ${moneda}</span>
            </div>
            ${aplicables.map(t => {
                const clave = `${claveMes}-${t.codigo}`;
                const pagado = pagos[clave];
                const limite = new Date(anio, mes, t.diaLimite);
                const vencido = ahora > limite && !pagado;
                return `
                <div class="onat-cal-item ${pagado ? 'pagado' : vencido ? 'vencido' : ''}" onclick="abrirDetalleTributo('${t.codigo}')">
                    <span>${pagado ? "✅" : vencido ? "🔴" : "⏳"} ${t.codigo}</span>
                    <span>${t.importe.toLocaleString("es-CU")} ${moneda} · Día ${t.diaLimite}</span>
                </div>`;
            }).join("")}
        </div>`;
    }).join("");
}

// ── Simulador ──
function calcularSimulacion() {
    const ventas = Number(document.getElementById("simVentas").value) || 0;
    const gastos = Number(document.getElementById("simGastos").value) || 0;
    const mes = new Date().getMonth();
    const anio = new Date().getFullYear();
    const moneda = DB.configuracion.moneda || "CUP";
    const tributos = calcularTributos(ventas, gastos, mes, anio);
    const total = Object.values(tributos).filter(t => t.esAplicable).reduce((s,t) => s + t.importe, 0);
    const utilidad = ventas - gastos;
    const neto = utilidad - total;

    document.getElementById("simResultado").innerHTML = `
        <div class="dashfin-row"><span>Ventas simuladas</span><strong>${ventas.toLocaleString("es-CU")} ${moneda}</strong></div>
        <div class="dashfin-row dashfin-resta"><span>− Gastos deducibles</span><strong>${gastos.toLocaleString("es-CU")} ${moneda}</strong></div>
        <div class="dashfin-sep"></div>
        <div class="dashfin-row dashfin-subtotal"><span>= Utilidad estimada</span><strong>${utilidad.toLocaleString("es-CU")} ${moneda}</strong></div>
        <div class="dashfin-row dashfin-resta"><span>− Total tributos estimados</span><strong>${total.toLocaleString("es-CU")} ${moneda}</strong></div>
        <div class="dashfin-sep"></div>
        <div class="dashfin-row dashfin-total"><span>= Resultado neto</span><strong>${neto.toLocaleString("es-CU")} ${moneda}</strong></div>
    `;

    document.getElementById("simDetalle").innerHTML = Object.values(tributos)
        .filter(t => t.esAplicable && t.importe > 0)
        .map((t,i,arr) => `
            <div class="cfg-row" style="cursor:default;">
                <div class="cfg-row-body"><span class="cfg-row-titulo">${t.codigo}</span><span class="cfg-row-sub">${t.nombre}</span></div>
                <strong style="font-family:'Syne',Arial,sans-serif;color:var(--warn);">${t.importe.toLocaleString("es-CU")} ${moneda}</strong>
            </div>${i<arr.length-1?'<div class="cfg-row-sep"></div>':''}`).join("");
}

// ── Expediente ──
function cargarExpediente() {
    const exp = DB.configuracion.expedienteFiscal || {};
    const cfg = getCfgFiscal();
    ["NIT","Nombre","Municipio","Actividad","Banco","Sucursal","Cuenta","Inspector","TelONAT","Correo"].forEach(k => {
        const el = document.getElementById("exped" + k);
        if (el) el.value = exp[k] || "";
    });
    document.getElementById("cfgTasa0114022").value = cfg.tasa0114022;
    document.getElementById("cfgTasa0510122").value = cfg.tasa0510122;
    document.getElementById("cfgMinExentoMensual").value = cfg.minExentoMensual;
    document.getElementById("cfgMinExentoAnual").value = cfg.minExentoAnual;
    document.getElementById("cfgSalarioEmpleados").value = cfg.salarioEmpleados;
    document.getElementById("cfgBaseContrib").value = cfg.baseContribTitular;
}

function guardarExpediente() {
    const exp = {};
    ["NIT","Nombre","Municipio","Actividad","Banco","Sucursal","Cuenta","Inspector","TelONAT","Correo"].forEach(k => {
        const el = document.getElementById("exped" + k);
        if (el) exp[k] = el.value;
    });
    DB.configuracion.expedienteFiscal = exp;
    if (!DB.configuracion.fiscal) DB.configuracion.fiscal = {};
    DB.configuracion.fiscal.tasa0114022 = Number(document.getElementById("cfgTasa0114022").value) || 10;
    DB.configuracion.fiscal.tasa0510122 = Number(document.getElementById("cfgTasa0510122").value) || 5;
    DB.configuracion.fiscal.minExentoMensual = Number(document.getElementById("cfgMinExentoMensual").value) || 3260;
    DB.configuracion.fiscal.minExentoAnual = Number(document.getElementById("cfgMinExentoAnual").value) || 39120;
    DB.configuracion.fiscal.salarioEmpleados = Number(document.getElementById("cfgSalarioEmpleados").value) || 0;
    DB.configuracion.fiscal.baseContribTitular = Number(document.getElementById("cfgBaseContrib").value) || 800;
    DB.guardar();
    mostrarToast("✅ Expediente fiscal guardado");
}

// ── Exportar PDF ONAT ──
function exportarReporteONAT() {
    const ahora = new Date();
    const mes = ahora.getMonth();
    const anio = ahora.getFullYear();
    const moneda = DB.configuracion.moneda || "CUP";
    const exp = DB.configuracion.expedienteFiscal || {};
    const ingresos = ingresosDelMes(mes, anio);
    const gastos = gastosDelMes(mes, anio);
    const tributos = calcularTributos(ingresos, gastos, mes, anio);
    const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("INVENTARY ARB — Reporte Fiscal ONAT", 14, 15);
    doc.setFontSize(11);
    doc.text(`NIT: ${exp.NIT || "—"} · ${exp.Nombre || "—"}`, 14, 23);
    doc.text(`Período: ${MESES[mes]} ${anio}`, 14, 30);
    doc.setFontSize(10);
    let y = 40;
    doc.text(`Ingresos del mes: ${ingresos.toLocaleString("es-CU")} ${moneda}`, 14, y); y+=7;
    doc.text(`Gastos deducibles: ${gastos.toLocaleString("es-CU")} ${moneda}`, 14, y); y+=7;
    doc.text(`Utilidad: ${(ingresos-gastos).toLocaleString("es-CU")} ${moneda}`, 14, y); y+=12;
    doc.setFontSize(12); doc.text("Tributos del mes:", 14, y); y+=8; doc.setFontSize(10);
    Object.values(tributos).filter(t=>t.esAplicable&&t.importe>0).forEach(t => {
        doc.text(`${t.codigo} — ${t.nombre}: ${t.importe.toLocaleString("es-CU")} ${moneda}`, 14, y); y+=7;
    });
    const total = Object.values(tributos).filter(t=>t.esAplicable).reduce((s,t)=>s+t.importe,0);
    y+=3; doc.setFontSize(12); doc.text(`Total tributos: ${total.toLocaleString("es-CU")} ${moneda}`, 14, y);
    doc.save(`onat-${MESES[mes].toLowerCase()}-${anio}.pdf`);
}

// ═══════════════════════════════════════════════
// MÓDULO PROVEEDORES
// ═══════════════════════════════════════════════
function mostrarProveedores() {
    const lista = document.getElementById("listaProveedores");
    const texto = document.getElementById("buscarProveedor").value.toLowerCase();
    const moneda = DB.configuracion.moneda || "CUP";
    const ahora = new Date();
    const iniMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59);
    let proveedores = [...DB.proveedores].sort((a, b) => (b.favorito?1:0)-(a.favorito?1:0));
    if (texto) proveedores = proveedores.filter(p => p.nombre.toLowerCase().includes(texto) || (p.contacto||"").toLowerCase().includes(texto));
    const totalComprasMes = DB.proveedores.reduce((s, p) => s + DB.totalCompradoProveedor(p.nombre, iniMes, finMes), 0);
    const productosConProv = new Set(DB.productos.filter(p => p.proveedor).map(p => p.proveedor)).size;
    const favorito = DB.proveedores.find(p => p.favorito);
    document.getElementById("provResumenTotal").innerText = DB.proveedores.length;
    document.getElementById("provResumenComprasMes").innerText = totalComprasMes.toLocaleString("es-CU");
    document.getElementById("provResumenProductos").innerText = productosConProv;
    document.getElementById("provResumenFavorito").innerText = favorito ? favorito.nombre.split(" ")[0] : "—";
    const menuEl = document.getElementById("menuResumenProveedores");
    if (menuEl) menuEl.innerText = DB.proveedores.length + " proveedor" + (DB.proveedores.length !== 1 ? "es" : "");
    if (proveedores.length === 0) {
        lista.innerHTML = `<p style="text-align:center;color:var(--text2);padding:40px 0;">${DB.proveedores.length === 0 ? "No hay proveedores registrados." : "Sin resultados."}</p>`;
        return;
    }
    const totalComprasGeneral = DB.movimientos.filter(m => m.tipo === "entrada").reduce((s, m) => s + (m.precioUnitario||0)*(m.cantidad||0), 0);
    lista.innerHTML = proveedores.map(p => {
        const comprasMes = DB.totalCompradoProveedor(p.nombre, iniMes, finMes);
        const productosCount = DB.productos.filter(pr => pr.proveedor === p.nombre).length;
        const ultimaCompra = DB.comprasProveedor(p.nombre).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
        const diasUltima = ultimaCompra ? Math.floor((ahora - new Date(ultimaCompra.fecha)) / (1000*60*60*24)) : null;
        const ultTxt = diasUltima === null ? "Sin compras" : diasUltima === 0 ? "Hoy" : diasUltima === 1 ? "Ayer" : `Hace ${diasUltima} días`;
        const pct = totalComprasGeneral > 0 ? Math.round((DB.totalCompradoProveedor(p.nombre, new Date(0), new Date()) / totalComprasGeneral) * 100) : 0;
        return `
        <div class="prov-card">
            <div class="prov-card-header" onclick="abrirPerfilProveedor('${p.id}')">
                <div class="prov-card-icono">🤝</div>
                <div class="prov-card-info">
                    <h4>${p.favorito ? "⭐ " : ""}${p.nombre}</h4>
                    ${p.contacto ? `<p>👤 ${p.contacto}</p>` : ""}
                    ${p.telefono ? `<p>📞 ${p.telefono}</p>` : ""}
                    <p>📦 ${productosCount} producto${productosCount!==1?"s":""} · ${pct}% compras · 🕐 ${ultTxt}</p>
                </div>
                <div class="prov-card-monto"><strong>${comprasMes.toLocaleString("es-CU")}</strong><span>${moneda}/mes</span></div>
            </div>
            <div class="prov-card-actions">
                ${p.telefono ? `<button onclick="window.open('tel:${p.telefono}')">📞 Llamar</button>` : ""}
                ${p.telefono ? `<button onclick="window.open('https://wa.me/53${p.telefono.replace(/\D/g,'')}')">💬 WhatsApp</button>` : ""}
                <button onclick="abrirPerfilProveedor('${p.id}')">👁 Ver perfil</button>
            </div>
        </div>`;
    }).join("");
}

function actualizarPerfilProveedor() {
    const p = DB.buscarProveedor(proveedorActualId); if (!p) return;
    document.getElementById("perfilProvNombre").innerText = (p.favorito?"⭐ ":"") + p.nombre;
    document.getElementById("perfilProvContacto").innerText = p.contacto || p.municipio || "—";
    document.getElementById("btnLlamarProv").style.display = p.telefono ? "block" : "none";
    document.getElementById("btnWhatsAppProv").style.display = p.telefono ? "block" : "none";
    cambiarTabProveedor(tabProveedorActual);
}

function cambiarTabProveedor(tab) {
    tabProveedorActual = tab;
    ["estadisticas","productos","historial"].forEach(t => {
        document.getElementById("provTab"+t.charAt(0).toUpperCase()+t.slice(1)).classList.toggle("activo", t===tab);
        document.getElementById("provContenido"+t.charAt(0).toUpperCase()+t.slice(1)).classList.toggle("oculto", t!==tab);
    });
    if (tab==="estadisticas") renderEstadisticasProveedor();
    else if (tab==="productos") renderProductosProveedor();
    else if (tab==="historial") renderHistorialProveedor();
}

function renderEstadisticasProveedor() {
    const p = DB.buscarProveedor(proveedorActualId); if (!p) return;
    const moneda = DB.configuracion.moneda || "CUP";
    const ahora = new Date();
    const iniMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const finMes = new Date(ahora.getFullYear(), ahora.getMonth()+1, 0, 23,59,59);
    const iniAnio = new Date(ahora.getFullYear(), 0, 1);
    const productos = DB.productos.filter(pr => pr.proveedor === p.nombre);
    const comprasMes = DB.totalCompradoProveedor(p.nombre, iniMes, finMes);
    const comprasAnio = DB.totalCompradoProveedor(p.nombre, iniAnio, new Date());
    const totalGeneral = DB.movimientos.filter(m=>m.tipo==="entrada").reduce((s,m)=>s+(m.precioUnitario||0)*(m.cantidad||0),0);
    const pct = totalGeneral > 0 ? Math.round((DB.totalCompradoProveedor(p.nombre,new Date(0),new Date())/totalGeneral)*100) : 0;
    const ultimaCompra = DB.comprasProveedor(p.nombre).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha))[0];
    document.getElementById("provStatProductos").innerText = productos.length;
    document.getElementById("provStatComprasMes").innerText = comprasMes.toLocaleString("es-CU");
    document.getElementById("provStatComprasAnio").innerText = comprasAnio.toLocaleString("es-CU");
    document.getElementById("provPorcentajeVal").innerText = pct+"%";
    document.getElementById("provPorcentajeCompras").innerText = `${pct}% del total de todas tus compras`;
    if (ultimaCompra) {
        const prod = DB.buscarProducto(ultimaCompra.productoId);
        document.getElementById("provUltimaCompraFecha").innerText = new Date(ultimaCompra.fecha).toLocaleDateString("es-CU");
        document.getElementById("provUltimaCompraDetalle").innerText = prod ? `${prod.nombre} · ${(ultimaCompra.precioUnitario||0).toLocaleString("es-CU")} ${moneda}/u` : "—";
    }
    document.getElementById("provDatosContacto").innerHTML = [
        p.contacto ? `<div class="cfg-row" style="cursor:default;"><div class="cfg-row-body"><span class="cfg-row-titulo">👤 Contacto</span><span class="cfg-row-sub">${p.contacto}</span></div></div><div class="cfg-row-sep"></div>` : "",
        p.telefono ? `<div class="cfg-row" style="cursor:pointer;" onclick="window.open('tel:${p.telefono}')"><div class="cfg-row-body"><span class="cfg-row-titulo">📞 Teléfono</span><span class="cfg-row-sub">${p.telefono}</span></div></div><div class="cfg-row-sep"></div>` : "",
        p.direccion ? `<div class="cfg-row" style="cursor:default;"><div class="cfg-row-body"><span class="cfg-row-titulo">📍 Dirección</span><span class="cfg-row-sub">${p.direccion}</span></div></div><div class="cfg-row-sep"></div>` : "",
        p.banco ? `<div class="cfg-row" style="cursor:default;"><div class="cfg-row-body"><span class="cfg-row-titulo">🏦 Banco</span><span class="cfg-row-sub">${p.banco}</span></div></div><div class="cfg-row-sep"></div>` : "",
        p.observaciones ? `<div class="cfg-row" style="cursor:default;"><div class="cfg-row-body"><span class="cfg-row-titulo">📝 Notas</span><span class="cfg-row-sub">${p.observaciones}</span></div></div>` : ""
    ].join("");
}

function renderProductosProveedor() {
    const p = DB.buscarProveedor(proveedorActualId); if (!p) return;
    const moneda = DB.configuracion.moneda || "CUP";
    const productos = DB.productos.filter(pr => pr.proveedor === p.nombre);
    const el = document.getElementById("provListaProductos");
    if (productos.length === 0) { el.innerHTML = `<p style="text-align:center;color:var(--text2);padding:30px 0;">No hay productos asociados.</p>`; return; }
    el.innerHTML = productos.map(prod => {
        const compras = DB.movimientos.filter(m=>m.tipo==="entrada"&&m.productoId===prod.id&&m.proveedor===p.nombre).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
        const ultimoPrecio = compras[0]?.precioUnitario || prod.compra || 0;
        const precioPromedio = compras.length > 0 ? Math.round(compras.reduce((s,m)=>s+(m.precioUnitario||0),0)/compras.length) : 0;
        const ultimaFecha = compras[0] ? new Date(compras[0].fecha).toLocaleDateString("es-CU") : "—";
        const precios = compras.slice(0,4).map(m=>m.precioUnitario||0).reverse();
        const tendencia = precios.length>=2 ? (precios[precios.length-1]>precios[0]?"📈":precios[precios.length-1]<precios[0]?"📉":"→") : "";
        return `
        <div class="gas-card" style="flex-direction:column;align-items:flex-start;gap:6px;">
            <div style="display:flex;justify-content:space-between;width:100%;">
                <div><h4 style="font-size:14px;font-weight:600;">${ICONOS[prod.categoria]||"📦"} ${prod.nombre} ${tendencia}</h4>
                <p style="font-size:12px;color:var(--text2);">Stock: ${prod.cantidad} ${prod.unidad||""} · ${ultimaFecha}</p></div>
                <div style="text-align:right;"><div style="font-family:'Syne',Arial,sans-serif;font-weight:700;color:var(--warn);">${ultimoPrecio.toLocaleString("es-CU")} ${moneda}</div>
                <div style="font-size:11px;color:var(--text2);">Prom: ${precioPromedio.toLocaleString("es-CU")}</div></div>
            </div>
            ${precios.length>=2?`<div style="font-size:11px;color:var(--text2);">Historial: ${precios.map(pr=>pr.toLocaleString("es-CU")).join(" → ")} ${moneda}</div>`:""}
        </div>`;
    }).join("");
}

function renderHistorialProveedor() {
    const p = DB.buscarProveedor(proveedorActualId); if (!p) return;
    const moneda = DB.configuracion.moneda || "CUP";
    const compras = DB.comprasProveedor(p.nombre).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
    const el = document.getElementById("provListaHistorial");
    if (compras.length === 0) { el.innerHTML = `<p style="text-align:center;color:var(--text2);padding:30px 0;">Sin compras registradas.</p>`; return; }
    el.innerHTML = compras.map(m => {
        const prod = DB.buscarProducto(m.productoId);
        const total = (m.precioUnitario||0)*(m.cantidad||0);
        return `
        <div class="gas-card" style="flex-direction:column;align-items:flex-start;gap:4px;">
            <div style="display:flex;justify-content:space-between;width:100%;">
                <div><h4 style="font-size:14px;font-weight:600;">📥 ${prod?prod.nombre:"Producto eliminado"}</h4>
                <p style="font-size:12px;color:var(--text2);">${m.cantidad} uds × ${(m.precioUnitario||0).toLocaleString("es-CU")} ${moneda} · ${new Date(m.fecha).toLocaleDateString("es-CU")}</p>
                ${m.factura?`<p style="font-size:11px;color:var(--text3);">Factura: ${m.factura}</p>`:""}</div>
                <strong style="font-family:'Syne',Arial,sans-serif;color:var(--accent);">${total.toLocaleString("es-CU")} ${moneda}</strong>
            </div>
        </div>`;
    }).join("");
}

function abrirModalProveedor(id) {
    if (id) {
        const p = DB.buscarProveedor(id); if (!p) return;
        editandoProveedorId = id;
        document.getElementById("modalProveedorTitulo").innerText = "✏️ Editar Proveedor";
        ["provNombre","provContacto","provTelefono","provDireccion","provMunicipio","provBanco","provCorreo","provObservaciones"].forEach(k => { const el=document.getElementById(k); if(el) el.value=p[k.replace("prov","").toLowerCase()]||""; });
        document.getElementById("provNombre").value = p.nombre||"";
        document.getElementById("provContacto").value = p.contacto||"";
        document.getElementById("provTelefono").value = p.telefono||"";
        document.getElementById("provDireccion").value = p.direccion||"";
        document.getElementById("provMunicipio").value = p.municipio||"";
        document.getElementById("provBanco").value = p.banco||"";
        document.getElementById("provCorreo").value = p.correo||"";
        document.getElementById("provObservaciones").value = p.observaciones||"";
        document.getElementById("provFavorito").checked = p.favorito===true;
        document.getElementById("btnEliminarProveedor").classList.remove("oculto");
    } else {
        editandoProveedorId = null;
        document.getElementById("modalProveedorTitulo").innerText = "🤝 Nuevo Proveedor";
        ["provNombre","provContacto","provTelefono","provDireccion","provMunicipio","provBanco","provCorreo","provObservaciones"].forEach(k => { const el=document.getElementById(k); if(el) el.value=""; });
        document.getElementById("provFavorito").checked = false;
        document.getElementById("btnEliminarProveedor").classList.add("oculto");
    }
    document.getElementById("modalProveedor").classList.remove("oculto");
}

function cerrarModalProveedor() { document.getElementById("modalProveedor").classList.add("oculto"); editandoProveedorId = null; }

document.getElementById("btnGuardarProveedor").addEventListener("click", () => {
    const nombre = document.getElementById("provNombre").value.trim();
    if (!nombre) { alert("⚠️ El nombre es obligatorio."); return; }
    const datos = {
        nombre, contacto: document.getElementById("provContacto").value.trim(),
        telefono: document.getElementById("provTelefono").value.trim(),
        direccion: document.getElementById("provDireccion").value.trim(),
        municipio: document.getElementById("provMunicipio").value.trim(),
        banco: document.getElementById("provBanco").value.trim(),
        correo: document.getElementById("provCorreo").value.trim(),
        favorito: document.getElementById("provFavorito").checked,
        observaciones: document.getElementById("provObservaciones").value.trim()
    };
    if (editandoProveedorId) {
        DB.actualizarProveedor(editandoProveedorId, datos);
        mostrarToast("✅ Proveedor actualizado");
        if (proveedorActualId === editandoProveedorId) actualizarPerfilProveedor();
    } else {
        DB.agregarProveedor(datos);
        mostrarToast("✅ Proveedor registrado");
    }
    cerrarModalProveedor(); mostrarProveedores();
});

function eliminarProveedorActual() {
    if (!editandoProveedorId) return;
    const p = DB.buscarProveedor(editandoProveedorId);
    if (!confirm(`¿Eliminar a ${p.nombre}?`)) return;
    DB.productos.filter(pr => pr.proveedor === p.nombre).forEach(pr => DB.actualizarProducto(pr.id, { proveedor: "" }));
    DB.eliminarProveedor(editandoProveedorId);
    cerrarModalProveedor(); mostrarToast("✅ Proveedor eliminado"); volverProveedores();
}

function llamarProveedor() { const p=DB.buscarProveedor(proveedorActualId); if(p&&p.telefono) window.open("tel:"+p.telefono); }
function whatsAppProveedor() { const p=DB.buscarProveedor(proveedorActualId); if(p&&p.telefono) window.open("https://wa.me/53"+p.telefono.replace(/\D/g,"")); }

function abrirSheetProveedores() {
    document.getElementById("sheetBuscadorProveedores").value = "";
    renderSheetListaProveedores();
    document.getElementById("sheetProveedores").classList.remove("oculto");
    setTimeout(() => document.getElementById("sheetBuscadorProveedores").focus(), 300);
}
function cerrarSheetProveedores() { document.getElementById("sheetProveedores").classList.add("oculto"); }
function cerrarSheetProveedoresSiOverlay(e) { if(e.target===document.getElementById("sheetProveedores")) cerrarSheetProveedores(); }

function renderSheetListaProveedores() {
    const texto = document.getElementById("sheetBuscadorProveedores").value.toLowerCase();
    const lista = document.getElementById("sheetListaProveedores");
    let provs = [...DB.proveedores].sort((a,b)=>(b.favorito?1:0)-(a.favorito?1:0));
    if (texto) provs = provs.filter(p=>p.nombre.toLowerCase().includes(texto));
    if (provs.length===0) { lista.innerHTML=`<p style="text-align:center;padding:20px;color:var(--text2);">No hay proveedores. Crea uno primero.</p>`; return; }
    lista.innerHTML = provs.map(p=>`
        <div class="sheet-item" onclick="seleccionarProveedor('${p.id}')">
            <div class="si-icono">🤝</div>
            <div class="si-info"><h4>${p.favorito?"⭐ ":""}${p.nombre}</h4><p>${p.contacto||p.municipio||"—"}</p></div>
            <div class="si-stock"><strong>${p.telefono||""}</strong></div>
        </div>`).join("");
}

function seleccionarProveedor(id) {
    const p = DB.buscarProveedor(id); if (!p) return;
    const el = document.getElementById("proveedor"); if (el) el.value = p.nombre;
    const tpEl = document.getElementById("textoProveedorSel");
    if (tpEl) { tpEl.className="texto-prod-seleccionado"; tpEl.innerText=`🤝 ${p.nombre}`; }
    cerrarSheetProveedores();
}

function toggleMenuOpcionesProveedores() { document.getElementById("menuOpcionesProveedores").classList.toggle("oculto"); }

function exportarProveedoresExcel() {
    document.getElementById("menuOpcionesProveedores").classList.add("oculto");
    const datos = DB.proveedores.map(p=>({ Nombre:p.nombre, Contacto:p.contacto||"", Teléfono:p.telefono||"", Dirección:p.direccion||"", Municipio:p.municipio||"", Favorito:p.favorito?"Sí":"No" }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Proveedores");
    XLSX.writeFile(wb, "proveedores-arb.xlsx");
}

function exportarProveedoresPDF() {
    document.getElementById("menuOpcionesProveedores").classList.add("oculto");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text("INVENTARY ARB — Proveedores", 14, 15);
    doc.setFontSize(10); doc.text("Generado: "+new Date().toLocaleDateString("es-CU"), 14, 22);
    doc.autoTable({ startY:28, head:[["Nombre","Contacto","Teléfono","Municipio"]],
        body: DB.proveedores.map(p=>[p.nombre, p.contacto||"—", p.telefono||"—", p.municipio||"—"]),
        styles:{fontSize:9}, headStyles:{fillColor:[0,188,188]} });
    doc.save("proveedores-arb.pdf");
}

// ═══════════════════════════════════════════════
// MÓDULO CAJA POS
// ═══════════════════════════════════════════════

function abrirSheetProductosPOS() {
    sheetModo = "pos";
    const filtrosEl = document.getElementById("sheetFiltros");
    const ubicaciones = [...new Set(DB.productos.map(p => p.almacen).filter(Boolean))];
    filtrosEl.innerHTML = `<button class="chip-filtro activo" data-filtro="" onclick="seleccionarFiltroSheet(this)">Todos</button>`;
    ubicaciones.forEach(ub => { filtrosEl.innerHTML += `<button class="chip-filtro" data-filtro="${ub}" onclick="seleccionarFiltroSheet(this)">📍 ${ub}</button>`; });
    sheetFiltroActivo = "";
    document.getElementById("sheetBuscador").value = "";
    renderSheetLista();
    document.getElementById("sheetProductos").classList.remove("oculto");
    setTimeout(() => document.getElementById("sheetBuscador").focus(), 300);
}

function seleccionarProductoPOS(id) {
    const p = DB.buscarProducto(id);
    if (!p) return;
    if (p.cantidad <= 0 && !DB.configuracion.ventasSinStock) {
        mostrarToast("⚠️ Sin stock disponible");
        cerrarSheetProductos();
        return;
    }
    // Si ya está en el carrito, suma 1
    const existente = posCarritoItems.find(item => item.producto.id === id);
    if (existente) {
        existente.cantidad++;
        existente.precioUnitario = calcularPrecioPOS(p, existente.cantidad);
    } else {
        posCarritoItems.push({
            producto: p,
            cantidad: 1,
            precioUnitario: calcularPrecioPOS(p, 1),
            descuento: 0
        });
    }
    cerrarSheetProductos();
    renderCarrito();
    mostrarToast(`✅ ${p.nombre} agregado`);
}

function calcularPrecioPOS(producto, cantidad) {
    // Aplica escala mayorista si existe
    const escala = escalaAplicable(producto, cantidad);
    return escala ? escala.precio : (producto.venta || 0);
}

function renderCarrito() {
    const contenedor = document.getElementById("posCarrito");
    const moneda = DB.configuracion.moneda || "CUP";

    if (posCarritoItems.length === 0) {
        contenedor.innerHTML = `<p id="posCarritoVacio" style="text-align:center;color:var(--text2);padding:20px 0;font-size:14px;">Agrega productos para comenzar</p>`;
        document.getElementById("posTotalAmount").innerText = "0 " + moneda;
        document.getElementById("posItemCount").innerText = "0 productos";
        document.getElementById("posDescuentoGlobal").classList.add("oculto");
        return;
    }

    const descGlobal = Number(document.getElementById("posDescGlobal").value) || 0;

    contenedor.innerHTML = posCarritoItems.map((item, idx) => {
        item.precioUnitario = calcularPrecioPOS(item.producto, item.cantidad);
        const precioConDesc = item.precioUnitario * (1 - item.descuento / 100);
        const subtotal = precioConDesc * item.cantidad;
        const escala = escalaAplicable(item.producto, item.cantidad);

        return `
        <div class="pos-item">
            <div class="pos-item-info">
                <div class="pos-item-nombre">${item.producto.nombre}</div>
                ${escala ? `<div style="font-size:10px;color:var(--accent);">🏷️ ${escala.nombre}</div>` : ""}
                <div class="pos-item-precio">${item.precioUnitario.toLocaleString("es-CU")} ${moneda}/u${item.descuento > 0 ? ` <span style="color:var(--warn);">−${item.descuento}%</span>` : ""}</div>
            </div>
            <div class="pos-item-controles">
                <button class="pos-qty-btn" onclick="cambiarCantidadPOS(${idx}, -1)">−</button>
                <span class="pos-qty">${item.cantidad}</span>
                <button class="pos-qty-btn" onclick="cambiarCantidadPOS(${idx}, 1)">+</button>
            </div>
            <div class="pos-item-subtotal">
                <strong>${subtotal.toLocaleString("es-CU")} ${moneda}</strong>
                <div style="display:flex;gap:4px;margin-top:4px;">
                    <button class="pos-desc-btn" onclick="editarDescuentoItem(${idx})">% desc</button>
                    <button class="pos-del-btn" onclick="eliminarItemPOS(${idx})">✕ quitar</button>
                </div>
            </div>
        </div>`;
    }).join("");

    recalcularTotal();
}

function cambiarCantidadPOS(idx, delta) {
    const item = posCarritoItems[idx];
    if (!item) return;
    const nueva = item.cantidad + delta;
    if (nueva <= 0) { eliminarItemPOS(idx); return; }
    if (nueva > item.producto.cantidad && !DB.configuracion.ventasSinStock) {
        mostrarToast(`⚠️ Solo hay ${item.producto.cantidad} en stock`);
        return;
    }
    item.cantidad = nueva;
    item.precioUnitario = calcularPrecioPOS(item.producto, nueva);
    renderCarrito();
}

function eliminarItemPOS(idx) {
    posCarritoItems.splice(idx, 1);
    renderCarrito();
}

function editarDescuentoItem(idx) {
    const item = posCarritoItems[idx];
    if (!item) return;
    const desc = prompt(`Descuento para ${item.producto.nombre} (%):`, item.descuento || 0);
    if (desc === null) return;
    const num = Math.min(100, Math.max(0, Number(desc) || 0));
    item.descuento = num;
    renderCarrito();
}

function recalcularTotal() {
    const moneda = DB.configuracion.moneda || "CUP";
    const descGlobal = Math.min(100, Math.max(0, Number(document.getElementById("posDescGlobal").value) || 0));

    let subtotal = 0;
    posCarritoItems.forEach(item => {
        const precioConDesc = item.precioUnitario * (1 - item.descuento / 100);
        subtotal += precioConDesc * item.cantidad;
    });

    const total = subtotal * (1 - descGlobal / 100);
    const totalUnidades = posCarritoItems.reduce((s, i) => s + i.cantidad, 0);

    document.getElementById("posTotalAmount").innerText = total.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("posItemCount").innerText = totalUnidades + " producto" + (totalUnidades !== 1 ? "s" : "");

    const descEl = document.getElementById("posDescuentoGlobal");
    if (descGlobal > 0) {
        descEl.classList.remove("oculto");
        document.getElementById("posDescuentoGlobalVal").innerText = descGlobal;
    } else {
        descEl.classList.add("oculto");
    }

    calcularCambio();
    calcularMixto();

    // Actualizar botones de monto rápido si está en modo efectivo
    if (posMetodoActual === "efectivo") {
        const total = getTotalPOS();
        const montos = generarMontosRapidos(total);
        const botonesEl = document.getElementById("posMontosBotones");
        if (botonesEl && total > 0) {
            botonesEl.innerHTML = montos.map(m => `
                <button onclick="document.getElementById('posEfectivoRecibido').value=${m};calcularCambio();"
                    style="padding:7px 14px;border-radius:20px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:13px;font-weight:600;cursor:pointer;">
                    ${m.toLocaleString("es-CU")}
                </button>`).join("");
        }
    }
}

function getTotalPOS() {
    const descGlobal = Math.min(100, Math.max(0, Number(document.getElementById("posDescGlobal").value) || 0));
    let subtotal = 0;
    posCarritoItems.forEach(item => {
        const precioConDesc = item.precioUnitario * (1 - item.descuento / 100);
        subtotal += precioConDesc * item.cantidad;
    });
    return subtotal * (1 - descGlobal / 100);
}

function seleccionarMetodoPOS(btn) {
    document.querySelectorAll(".pos-metodo").forEach(b => b.classList.remove("activo"));
    btn.classList.add("activo");
    posMetodoActual = btn.dataset.metodo;
    document.getElementById("posEfectivoBloque").style.display = posMetodoActual === "efectivo" ? "block" : "none";
    document.getElementById("posMixtoBloque").classList.toggle("oculto", posMetodoActual !== "mixto");
    document.getElementById("posFiadoBloque").classList.toggle("oculto", posMetodoActual !== "fiado");

    if (posMetodoActual === "efectivo") {
        // Generar botones de monto rápido basados en el total actual
        const total = getTotalPOS();
        const montos = generarMontosRapidos(total);
        const botonesEl = document.getElementById("posMontosBotones");
        if (botonesEl) {
            botonesEl.innerHTML = montos.map(m => `
                <button onclick="document.getElementById('posEfectivoRecibido').value=${m};calcularCambio();"
                    style="padding:7px 14px;border-radius:20px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:13px;font-weight:600;cursor:pointer;transition:0.12s;"
                    onmousedown="this.style.background='var(--accent)';this.style.color='#0a0f0d';"
                    onmouseup="this.style.background='var(--surface2)';this.style.color='var(--text)';">
                    ${m.toLocaleString("es-CU")}
                </button>`).join("");
        }
        document.getElementById("posEfectivoRecibido").value = "";
        document.getElementById("posCambio").innerText = "—";
        document.getElementById("posCambio").style.color = "var(--text3)";
    }
}

function generarMontosRapidos(total) {
    if (total === 0) return [];
    // Genera: monto exacto + redondeos hacia arriba
    const montos = new Set();
    montos.add(total); // Monto exacto
    // Redondear a múltiplos convenientes
    const redondeos = [50, 100, 200, 500, 1000];
    for (const r of redondeos) {
        const redondeado = Math.ceil(total / r) * r;
        if (redondeado > total && redondeado <= total * 2) montos.add(redondeado);
        if (montos.size >= 4) break;
    }
    return [...montos].sort((a, b) => a - b).slice(0, 4);
}

function calcularCambio() {
    if (posMetodoActual !== "efectivo") return;
    const total = getTotalPOS();
    const recibido = Number(document.getElementById("posEfectivoRecibido").value) || 0;
    const cambioEl = document.getElementById("posCambio");
    if (recibido === 0) {
        cambioEl.innerText = "—";
        cambioEl.style.color = "var(--text3)";
        return;
    }
    const cambio = recibido - total;
    cambioEl.innerText = cambio >= 0 ? cambio.toLocaleString("es-CU") : "Falta " + Math.abs(cambio).toLocaleString("es-CU");
    cambioEl.style.color = cambio >= 0 ? "var(--accent)" : "var(--warn)";
}

function calcularMixto() {
    if (posMetodoActual !== "mixto") return;
    const total = getTotalPOS();
    const efectivo = Number(document.getElementById("posMixtoEfectivo").value) || 0;
    const transf = Number(document.getElementById("posMixtoTransferencia").value) || 0;
    const restante = total - efectivo - transf;
    const moneda = DB.configuracion.moneda || "CUP";
    const el = document.getElementById("posMixtoRestante");
    if (restante > 0) {
        el.innerText = `Falta: ${restante.toLocaleString("es-CU")} ${moneda}`;
        el.style.color = "var(--warn)";
    } else if (restante < 0) {
        el.innerText = `Cambio: ${Math.abs(restante).toLocaleString("es-CU")} ${moneda}`;
        el.style.color = "var(--accent)";
    } else {
        el.innerText = "✅ Monto exacto";
        el.style.color = "var(--accent)";
    }
}

function procesarVentaPOS() {
    if (posCarritoItems.length === 0) { mostrarToast("⚠️ El carrito está vacío"); return; }
    const total = getTotalPOS();
    const moneda = DB.configuracion.moneda || "CUP";

    // Validaciones por método
    if (posMetodoActual === "efectivo") {
        const recibido = Number(document.getElementById("posEfectivoRecibido").value) || 0;
        if (recibido > 0 && recibido < total) {
            mostrarToast("⚠️ El monto recibido es menor al total");
            return;
        }
    }
    if (posMetodoActual === "fiado") {
        const clienteId = document.getElementById("posClienteId").value;
        if (!clienteId) { mostrarToast("⚠️ Selecciona un cliente para venta fiada"); return; }
        // Verificar límite de crédito
        const cli = DB.buscarCliente(clienteId);
        if (cli && cli.limiteCredito > 0) {
            const saldo = DB.saldoCliente(clienteId);
            if (saldo + total > cli.limiteCredito) {
                if (!confirm(`⚠️ ${cli.nombre} supera su límite de crédito. ¿Continuar?`)) return;
            }
        }
    }
    if (posMetodoActual === "mixto") {
        const ef = Number(document.getElementById("posMixtoEfectivo").value) || 0;
        const tr = Number(document.getElementById("posMixtoTransferencia").value) || 0;
        if (ef + tr < total) { mostrarToast("⚠️ El monto total no cubre la venta"); return; }
    }

    // Procesar cada item del carrito
    const descGlobal = Math.min(100, Math.max(0, Number(document.getElementById("posDescGlobal").value) || 0));
    const clienteId = posMetodoActual === "fiado" ? document.getElementById("posClienteId").value : null;
    const cli = clienteId ? DB.buscarCliente(clienteId) : null;
    const fechaVenta = new Date().toISOString();

    posCarritoItems.forEach(item => {
        const precioConDesc = item.precioUnitario * (1 - item.descuento / 100) * (1 - descGlobal / 100);
        let costoReal = null;

        if (item.producto.usaFifo) {
            const resultado = DB.consumirLotesFIFO(item.producto.id, item.cantidad);
            costoReal = resultado.costoUnitarioPromedio;
        } else {
            const prod = DB.buscarProducto(item.producto.id);
            DB.actualizarProducto(item.producto.id, { cantidad: prod.cantidad - item.cantidad });
        }

        DB.registrarMovimiento("salida", item.producto.id, {
            cantidad: item.cantidad,
            precioUnitario: precioConDesc,
            costoReal,
            metodoPago: posMetodoActual === "mixto" ? "mixto" : posMetodoActual,
            montoEfectivo: posMetodoActual === "mixto" ? (Number(document.getElementById("posMixtoEfectivo").value) || 0) : (posMetodoActual === "efectivo" ? (Number(document.getElementById("posEfectivoRecibido").value) || 0) : 0),
            montoTransferencia: posMetodoActual === "mixto" ? (Number(document.getElementById("posMixtoTransferencia").value) || 0) : 0,
            cliente: cli ? cli.nombre : "",
            clienteId,
            nota: `Venta POS${item.descuento > 0 ? ` (desc. ${item.descuento}%)` : ""}${descGlobal > 0 ? ` (desc. global ${descGlobal}%)` : ""}`,
            fecha: fechaVenta
        });
    });

    // Actualizar método predeterminado (excepto fiado)
    if (posMetodoActual !== "fiado") {
        DB.configuracion.metodoPagoDefault = posMetodoActual;
        DB.guardar();
    }

    const cambio = posMetodoActual === "efectivo"
        ? Math.max(0, (Number(document.getElementById("posEfectivoRecibido").value) || 0) - total)
        : 0;

    const msg = `✅ Venta registrada\nTotal: ${total.toLocaleString("es-CU")} ${moneda}${cambio > 0 ? `\nCambio: ${cambio.toLocaleString("es-CU")} ${moneda}` : ""}`;
    mostrarToast(msg.split("\n")[0]);

    actualizarInicio();
    abrirCajaPOS(); // Limpia y queda listo para nueva venta
}

// ── Cierre de Caja ──
function renderCierreCaja() {
    const hoy = new Date();
    const inicio = new Date(hoy); inicio.setHours(0,0,0,0);
    const fin = new Date(hoy); fin.setHours(23,59,59,999);
    const moneda = DB.configuracion.moneda || "CUP";

    document.getElementById("cierreFecha").innerText = hoy.toLocaleDateString("es-CU", { weekday:"long", day:"numeric", month:"long" });

    const ventasHoy = DB.movimientos.filter(m =>
        m.tipo === "salida" && new Date(m.fecha) >= inicio && new Date(m.fecha) <= fin
    );

    const totalVentas = ventasHoy.reduce((s, m) => s + (m.precioUnitario||0)*(m.cantidad||0), 0);

    // Desglose por método — mixto usa los montos guardados
    let efectivoTotal = 0, transferenciaTotal = 0, fiadoTotal = 0;
    ventasHoy.forEach(m => {
        const monto = (m.precioUnitario||0)*(m.cantidad||0);
        if (m.metodoPago === "efectivo") {
            efectivoTotal += monto;
        } else if (m.metodoPago === "transfermovil" || m.metodoPago === "enzona") {
            transferenciaTotal += monto;
        } else if (m.metodoPago === "fiado") {
            fiadoTotal += monto;
        } else if (m.metodoPago === "mixto") {
            // Usar montos reales guardados si existen
            efectivoTotal += m.montoEfectivo || 0;
            transferenciaTotal += m.montoTransferencia || 0;
        }
    });
    const unidades = ventasHoy.reduce((s, m) => s + (m.cantidad||0), 0);
    const costo = ventasHoy.reduce((s, m) => s + (typeof m.costoReal==="number" ? m.costoReal : 0)*(m.cantidad||0), 0);
    const ganancia = totalVentas - costo;

    document.getElementById("cierreTotalVentas").innerText = totalVentas.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("cierreEfectivo").innerText = efectivoTotal.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("cierreTransferencia").innerText = transferenciaTotal.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("cierreFiado").innerText = fiadoTotal.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("cierreTransacciones").innerText = ventasHoy.length;
    document.getElementById("cierreUnidades").innerText = unidades;
    document.getElementById("cierreIngresos").innerText = totalVentas.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("cierreCosto").innerText = costo.toLocaleString("es-CU") + " " + moneda;
    document.getElementById("cierreGanancia").innerText = ganancia.toLocaleString("es-CU") + " " + moneda;

    // Top productos del día
    const porProducto = {};
    ventasHoy.forEach(m => {
        const p = DB.buscarProducto(m.productoId);
        if (!p) return;
        if (!porProducto[p.id]) porProducto[p.id] = { nombre: p.nombre, cantidad: 0, total: 0 };
        porProducto[p.id].cantidad += m.cantidad || 0;
        porProducto[p.id].total += (m.precioUnitario||0)*(m.cantidad||0);
    });
    const top = Object.values(porProducto).sort((a,b) => b.total-a.total).slice(0,5);
    const topEl = document.getElementById("cierreTopProductos");
    topEl.innerHTML = top.length === 0
        ? `<div class="cfg-row" style="cursor:default;"><div class="cfg-row-body"><span class="cfg-row-sub">Sin ventas registradas hoy</span></div></div>`
        : top.map((p,i) => `
            <div class="cfg-row" style="cursor:default;">
                <div class="cfg-row-body"><span class="cfg-row-titulo">${p.nombre}</span><span class="cfg-row-sub">${p.cantidad} unidades</span></div>
                <strong style="font-family:'Syne',Arial,sans-serif;color:var(--accent);">${p.total.toLocaleString("es-CU")} ${moneda}</strong>
            </div>${i<top.length-1?'<div class="cfg-row-sep"></div>':''}`).join("");
}

function compartirCierreWhatsApp() {
    const negocio = DB.configuracion.nombreNegocio || "Mi Negocio";
    const moneda = DB.configuracion.moneda || "CUP";
    const hoy = new Date().toLocaleDateString("es-CU");
    const ventas = document.getElementById("cierreTotalVentas").innerText;
    const ganancia = document.getElementById("cierreGanancia").innerText;
    const transacciones = document.getElementById("cierreTransacciones").innerText;
    const txt = `📊 *Cierre de Caja — ${negocio}*\n📅 ${hoy}\n\n💰 Total ventas: ${ventas}\n📈 Ganancia: ${ganancia}\n🧾 Transacciones: ${transacciones}\n\n_Generado con INVENTARY ARB_`;
    window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
}

function exportarCierrePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const negocio = DB.configuracion.nombreNegocio || "Mi Negocio";
    const moneda = DB.configuracion.moneda || "CUP";
    doc.setFontSize(16);
    doc.text(`Cierre de Caja — ${negocio}`, 14, 15);
    doc.setFontSize(11);
    doc.text(`Fecha: ${new Date().toLocaleDateString("es-CU")}`, 14, 23);
    doc.setFontSize(10);
    let y = 35;
    const add = (l, v) => { doc.text(l, 14, y); doc.text(v, 120, y); y += 8; };
    add("Total ventas:", document.getElementById("cierreTotalVentas").innerText);
    add("Efectivo:", document.getElementById("cierreEfectivo").innerText);
    add("Transferencia:", document.getElementById("cierreTransferencia").innerText);
    add("Fiado:", document.getElementById("cierreFiado").innerText);
    add("Transacciones:", document.getElementById("cierreTransacciones").innerText);
    add("Unidades vendidas:", document.getElementById("cierreUnidades").innerText);
    y += 4;
    add("Ganancia neta:", document.getElementById("cierreGanancia").innerText);
    doc.save(`cierre-caja-${new Date().toISOString().slice(0,10)}.pdf`);
}
