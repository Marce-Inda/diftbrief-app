/**
 * @fileoverview Base de Conocimiento estática para el Sistema Multi-Agente RAG.
 * Provee datos verificados de regulaciones, frameworks y playbooks que los agentes
 * consultan para garantizar cero alucinaciones en briefings generados.
 */

import type { SecurityKnowledgeBase } from '../types';

/**
 * Base de conocimiento de seguridad con datos verificados.
 * Los agentes especializados consultan esta fuente para fundamentar
 * sus recomendaciones con referencias legales, tácticas y procedimientos reales.
 */
export const SECURITY_KNOWLEDGE_BASE: SecurityKnowledgeBase = {
  regulations: [
    {
      id: 'gdpr',
      name: 'Reglamento General de Protección de Datos (GDPR)',
      jurisdiction: 'Unión Europea / EEA',
      scope: 'Protección de datos personales de individuos en la UE',
      notificationDeadlineHours: 72,
      penalties: 'Hasta 20 millones EUR o 4% de la facturación anual global (lo que sea mayor)',
      keyArticles: [
        {
          id: 'Art. 33',
          title: 'Notificación a la autoridad supervisora',
          summary: 'El responsable del tratamiento debe notificar una violación de datos personales a la autoridad supervisora competente dentro de las 72 horas siguientes a tener conocimiento de ella, a menos que sea improbable que la violación suponga un riesgo para los derechos y libertades de las personas.',
        },
        {
          id: 'Art. 34',
          title: 'Comunicación al interesado',
          summary: 'Cuando la violación de datos personales entrañe un alto riesgo para los derechos y libertades de las personas físicas, el responsable debe comunicar la violación al interesado sin dilación indebida.',
        },
        {
          id: 'Art. 32',
          title: 'Seguridad del tratamiento',
          summary: 'El responsable y el encargado deben implementar medidas técnicas y organizativas apropiadas para garantizar un nivel de seguridad adecuado al riesgo, incluyendo cifrado, resiliencia y capacidad de restauración.',
        },
      ],
    },
    {
      id: 'hipaa',
      name: 'Ley de Portabilidad y Responsabilidad (HIPAA)',
      jurisdiction: 'Estados Unidos',
      scope: 'Protección de información de salud protegida (PHI)',
      notificationDeadlineHours: 1440, // 60 días
      penalties: 'Desde $100 hasta $50,000 por violación individual; máximo $1.5 millones por categoría de violación por año',
      keyArticles: [
        {
          id: '§164.408',
          title: 'Notificación al Secretario de HHS',
          summary: 'Brechas que afecten a 500 o más individuos deben ser reportadas al Secretario de HHS sin demora irrazonable y dentro de los 60 días del descubrimiento.',
        },
        {
          id: '§164.404',
          title: 'Notificación a individuos',
          summary: 'Las entidades cubiertas deben notificar a cada individuo cuya PHI no asegurada haya sido comprometida, sin demora irrazonable y dentro de los 60 días del descubrimiento.',
        },
        {
          id: '§164.312',
          title: 'Salvaguardas técnicas',
          summary: 'Requiere controles de acceso, auditoría, integridad y seguridad de transmisión para toda PHI electrónica.',
        },
      ],
    },
    {
      id: 'nis2',
      name: 'Directiva de Seguridad NIS2',
      jurisdiction: 'Unión Europea',
      scope: 'Infraestructura crítica y entidades esenciales/importantes',
      notificationDeadlineHours: 24, // Alerta temprana en 24h, notificación completa en 72h
      penalties: 'Entidades esenciales: hasta 10 millones EUR o 2% facturación global. Entidades importantes: hasta 7 millones EUR o 1.4% facturación global',
      keyArticles: [
        {
          id: 'Art. 23',
          title: 'Obligaciones de notificación',
          summary: 'Alerta temprana al CSIRT en 24 horas. Notificación completa del incidente en 72 horas. Informe final en un mes con análisis de causa raíz y medidas de mitigación.',
        },
        {
          id: 'Art. 21',
          title: 'Medidas de gestión de riesgos de ciberseguridad',
          summary: 'Las entidades deben adoptar medidas técnicas, operativas y organizativas apropiadas incluyendo políticas de análisis de riesgos, gestión de incidentes, continuidad de negocio y seguridad de la cadena de suministro.',
        },
        {
          id: 'Art. 32',
          title: 'Poderes de supervisión y ejecución',
          summary: 'Las autoridades competentes pueden realizar auditorías, inspecciones in situ y emitir instrucciones vinculantes a entidades que incumplan.',
        },
      ],
    },
  ],

  frameworks: [
    {
      id: 'TA0010',
      name: 'Exfiltration',
      description: 'El adversario intenta robar datos de la red comprometida. Técnicas que permiten extraer información hacia servidores controlados por el atacante.',
      commonTechniques: [
        'T1048 - Exfiltration Over Alternative Protocol',
        'T1041 - Exfiltration Over C2 Channel',
        'T1567 - Exfiltration Over Web Service',
        'T1029 - Scheduled Transfer',
      ],
      mitigations: [
        'Monitoreo de tráfico de red saliente con DLP',
        'Segmentación de red y restricción de protocolos de salida',
        'Inspección SSL/TLS en proxy de egreso',
        'Alertas en transferencias de datos anómalas por volumen o destino',
      ],
    },
    {
      id: 'TA0008',
      name: 'Lateral Movement',
      description: 'El adversario se mueve a través de la red interna para alcanzar activos de alto valor. Utiliza credenciales robadas o exploits internos para pivotar entre sistemas.',
      commonTechniques: [
        'T1021 - Remote Services (RDP, SSH, SMB)',
        'T1550 - Use Alternate Authentication Material (Pass-the-Hash)',
        'T1570 - Lateral Tool Transfer',
        'T1563 - Remote Service Session Hijacking',
      ],
      mitigations: [
        'Implementar segmentación de red con micro-perímetros',
        'Deshabilitar protocolos de administración remota innecesarios',
        'Aplicar MFA en todos los accesos administrativos internos',
        'Monitorizar autenticaciones anómalas entre workstations',
      ],
    },
    {
      id: 'TA0003',
      name: 'Persistence',
      description: 'El adversario mantiene acceso a los sistemas comprometidos a través de reinicios, cambios de credenciales u otras interrupciones que podrían cortar su acceso.',
      commonTechniques: [
        'T1547 - Boot or Logon Autostart Execution',
        'T1053 - Scheduled Task/Job',
        'T1136 - Create Account',
        'T1505 - Server Software Component (Web Shell)',
      ],
      mitigations: [
        'Auditoría periódica de tareas programadas y servicios',
        'Monitoreo de integridad de archivos en directorios críticos',
        'Revisión de cuentas creadas recientemente sin autorización',
        'Escaneo de web shells en servidores expuestos',
      ],
    },
    {
      id: 'TA0040',
      name: 'Impact',
      description: 'El adversario intenta manipular, interrumpir o destruir sistemas y datos. Incluye destrucción de datos, defacement y manipulación de información para afectar la integridad.',
      commonTechniques: [
        'T1485 - Data Destruction',
        'T1486 - Data Encrypted for Impact (Ransomware)',
        'T1565 - Data Manipulation',
        'T1491 - Defacement',
      ],
      mitigations: [
        'Backups offline verificados y aislados del dominio principal',
        'Controles de integridad en bases de datos críticas',
        'Plan de recuperación ante desastres probado trimestralmente',
        'Detección de cifrado masivo en endpoints (anti-ransomware)',
      ],
    },
  ],

  playbooks: [
    {
      id: 'network-isolation',
      name: 'Aislamiento de Red',
      applicableWhen: 'Se confirma movimiento lateral activo o exfiltración de datos en progreso',
      priority: 1,
      steps: [
        {
          order: 1,
          action: 'Identificar segmentos comprometidos',
          detail: 'Usar logs de firewall, NetFlow y EDR para determinar qué VLANs o subredes tienen actividad maliciosa confirmada.',
        },
        {
          order: 2,
          action: 'Aislar segmentos afectados',
          detail: 'Aplicar reglas de firewall para bloquear tráfico lateral desde/hacia segmentos comprometidos. Mantener acceso de gestión por canal out-of-band.',
        },
        {
          order: 3,
          action: 'Bloquear comunicación C2',
          detail: 'Agregar IOCs (IPs, dominios) a listas de bloqueo en proxy, DNS sinkhole y firewall perimetral.',
        },
        {
          order: 4,
          action: 'Verificar contención',
          detail: 'Confirmar que no hay tráfico saliente hacia infraestructura C2 y que el movimiento lateral se detuvo mediante monitoreo activo durante 30 minutos.',
        },
        {
          order: 5,
          action: 'Documentar y escalar',
          detail: 'Registrar hora exacta del aislamiento, segmentos afectados, servicios impactados y notificar a gestión de crisis para evaluación de impacto en negocio.',
        },
      ],
    },
    {
      id: 'forensic-preservation',
      name: 'Preservación Forense',
      applicableWhen: 'Se requiere evidencia digital para investigación interna, legal o regulatoria',
      priority: 2,
      steps: [
        {
          order: 1,
          action: 'Asegurar la cadena de custodia',
          detail: 'Documentar quién accede a qué evidencia, cuándo y con qué herramientas. Usar formularios de cadena de custodia estándar.',
        },
        {
          order: 2,
          action: 'Capturar memoria volátil',
          detail: 'Antes de apagar sistemas, adquirir dump de RAM usando herramientas forenses (ej. AVML, WinPMEM). La memoria contiene artefactos que se pierden al reiniciar.',
        },
        {
          order: 3,
          action: 'Crear imágenes forenses de disco',
          detail: 'Generar imágenes bit-a-bit (dd, FTK Imager) de discos afectados. Calcular y registrar hashes SHA-256 de las imágenes para verificar integridad.',
        },
        {
          order: 4,
          action: 'Preservar logs relevantes',
          detail: 'Exportar y asegurar logs de SIEM, firewall, proxy, DNS, Active Directory y endpoints. Verificar que la retención no expire antes de completar la investigación.',
        },
        {
          order: 5,
          action: 'Almacenar evidencia en repositorio seguro',
          detail: 'Transferir imágenes y artefactos a almacenamiento cifrado con acceso restringido. Documentar ubicación y controles de acceso.',
        },
      ],
    },
    {
      id: 'credential-reset',
      name: 'Restablecimiento Masivo de Credenciales',
      applicableWhen: 'Se confirma compromiso de credenciales privilegiadas o acceso al controlador de dominio',
      priority: 1,
      steps: [
        {
          order: 1,
          action: 'Evaluar alcance del compromiso',
          detail: 'Determinar qué cuentas fueron comprometidas (locales, de dominio, de servicio). Verificar si el atacante tiene acceso al KRBTGT o hashes de DC.',
        },
        {
          order: 2,
          action: 'Revocar sesiones activas',
          detail: 'Invalidar todos los tokens de sesión y tickets Kerberos de cuentas comprometidas. Forzar cierre de sesiones RDP/VPN activas.',
        },
        {
          order: 3,
          action: 'Restablecer contraseñas por prioridad',
          detail: 'Orden: 1) Cuentas de administrador de dominio, 2) Cuentas de servicio privilegiadas, 3) KRBTGT (doble reset), 4) Usuarios estándar afectados.',
        },
        {
          order: 4,
          action: 'Rotar secretos de aplicación',
          detail: 'Cambiar API keys, certificados, connection strings y secretos de aplicación que pudieran haber sido accesibles desde sistemas comprometidos.',
        },
        {
          order: 5,
          action: 'Verificar y monitorear',
          detail: 'Confirmar que no hay autenticaciones con credenciales antiguas. Implementar alertas reforzadas para intentos de login fallidos y uso de cuentas recién restablecidas.',
        },
      ],
    },
  ],
};
