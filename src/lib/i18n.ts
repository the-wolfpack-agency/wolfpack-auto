/**
 * Multi-Language Support (i18n)
 *
 * Simple, zero-dependency internationalization for dealer-facing content.
 * Supports English, Spanish, and French with variable interpolation.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type Locale = "en" | "es" | "fr";

export type TranslationKey =
  | "inventory.title"
  | "inventory.search_placeholder"
  | "inventory.no_results"
  | "inventory.vehicles_found"
  | "financing.title"
  | "financing.apply_now"
  | "financing.monthly_payment"
  | "financing.down_payment"
  | "financing.credit_score"
  | "trade_in.title"
  | "trade_in.estimate_value"
  | "trade_in.vin_placeholder"
  | "schedule.title"
  | "schedule.test_drive"
  | "schedule.service_appointment"
  | "schedule.pick_date"
  | "schedule.pick_time"
  | "contact.title"
  | "contact.name"
  | "contact.email"
  | "contact.phone"
  | "contact.message"
  | "contact.send"
  | "common.loading"
  | "common.error"
  | "common.save"
  | "common.cancel"
  | "common.back"
  | "common.next"
  | "common.submit"
  | "common.price"
  | "common.year"
  | "common.make"
  | "common.model"
  | "common.mileage"
  | "common.view_details"
  | "common.call_us"
  | "common.directions";

export interface TranslationBundle {
  locale: Locale;
  translations: Record<TranslationKey, string>;
}

/* ------------------------------------------------------------------ */
/*  Translation data                                                   */
/* ------------------------------------------------------------------ */

const TRANSLATIONS: Record<Locale, Record<TranslationKey, string>> = {
  en: {
    "inventory.title": "Browse Inventory",
    "inventory.search_placeholder": "Search by make, model, or keyword...",
    "inventory.no_results": "No vehicles found matching your criteria.",
    "inventory.vehicles_found": "{{count}} vehicles found",
    "financing.title": "Financing Options",
    "financing.apply_now": "Apply Now",
    "financing.monthly_payment": "Estimated Monthly Payment",
    "financing.down_payment": "Down Payment",
    "financing.credit_score": "Credit Score",
    "trade_in.title": "Trade-In Value",
    "trade_in.estimate_value": "Estimate Your Trade-In",
    "trade_in.vin_placeholder": "Enter your VIN",
    "schedule.title": "Schedule",
    "schedule.test_drive": "Schedule a Test Drive",
    "schedule.service_appointment": "Book Service Appointment",
    "schedule.pick_date": "Pick a Date",
    "schedule.pick_time": "Pick a Time",
    "contact.title": "Contact Us",
    "contact.name": "Your Name",
    "contact.email": "Email Address",
    "contact.phone": "Phone Number",
    "contact.message": "Message",
    "contact.send": "Send Message",
    "common.loading": "Loading...",
    "common.error": "Something went wrong. Please try again.",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.back": "Back",
    "common.next": "Next",
    "common.submit": "Submit",
    "common.price": "Price",
    "common.year": "Year",
    "common.make": "Make",
    "common.model": "Model",
    "common.mileage": "Mileage",
    "common.view_details": "View Details",
    "common.call_us": "Call Us",
    "common.directions": "Get Directions",
  },
  es: {
    "inventory.title": "Explorar Inventario",
    "inventory.search_placeholder": "Buscar por marca, modelo o palabra clave...",
    "inventory.no_results": "No se encontraron vehiculos que coincidan con sus criterios.",
    "inventory.vehicles_found": "{{count}} vehiculos encontrados",
    "financing.title": "Opciones de Financiamiento",
    "financing.apply_now": "Aplicar Ahora",
    "financing.monthly_payment": "Pago Mensual Estimado",
    "financing.down_payment": "Enganche",
    "financing.credit_score": "Puntaje de Credito",
    "trade_in.title": "Valor de Intercambio",
    "trade_in.estimate_value": "Estime su Intercambio",
    "trade_in.vin_placeholder": "Ingrese su VIN",
    "schedule.title": "Programar",
    "schedule.test_drive": "Programar Prueba de Manejo",
    "schedule.service_appointment": "Agendar Cita de Servicio",
    "schedule.pick_date": "Elija una Fecha",
    "schedule.pick_time": "Elija una Hora",
    "contact.title": "Contactenos",
    "contact.name": "Su Nombre",
    "contact.email": "Correo Electronico",
    "contact.phone": "Numero de Telefono",
    "contact.message": "Mensaje",
    "contact.send": "Enviar Mensaje",
    "common.loading": "Cargando...",
    "common.error": "Algo salio mal. Por favor, intente de nuevo.",
    "common.save": "Guardar",
    "common.cancel": "Cancelar",
    "common.back": "Atras",
    "common.next": "Siguiente",
    "common.submit": "Enviar",
    "common.price": "Precio",
    "common.year": "Ano",
    "common.make": "Marca",
    "common.model": "Modelo",
    "common.mileage": "Kilometraje",
    "common.view_details": "Ver Detalles",
    "common.call_us": "Llamenos",
    "common.directions": "Como Llegar",
  },
  fr: {
    "inventory.title": "Parcourir l'Inventaire",
    "inventory.search_placeholder": "Rechercher par marque, modele ou mot-cle...",
    "inventory.no_results": "Aucun vehicule ne correspond a vos criteres.",
    "inventory.vehicles_found": "{{count}} vehicules trouves",
    "financing.title": "Options de Financement",
    "financing.apply_now": "Postuler Maintenant",
    "financing.monthly_payment": "Paiement Mensuel Estime",
    "financing.down_payment": "Mise de Fonds",
    "financing.credit_score": "Cote de Credit",
    "trade_in.title": "Valeur de Reprise",
    "trade_in.estimate_value": "Estimez Votre Reprise",
    "trade_in.vin_placeholder": "Entrez votre NIV",
    "schedule.title": "Planifier",
    "schedule.test_drive": "Planifier un Essai Routier",
    "schedule.service_appointment": "Prendre un Rendez-vous de Service",
    "schedule.pick_date": "Choisir une Date",
    "schedule.pick_time": "Choisir une Heure",
    "contact.title": "Nous Contacter",
    "contact.name": "Votre Nom",
    "contact.email": "Adresse Courriel",
    "contact.phone": "Numero de Telephone",
    "contact.message": "Message",
    "contact.send": "Envoyer le Message",
    "common.loading": "Chargement...",
    "common.error": "Une erreur est survenue. Veuillez reessayer.",
    "common.save": "Enregistrer",
    "common.cancel": "Annuler",
    "common.back": "Retour",
    "common.next": "Suivant",
    "common.submit": "Soumettre",
    "common.price": "Prix",
    "common.year": "Annee",
    "common.make": "Marque",
    "common.model": "Modele",
    "common.mileage": "Kilometrage",
    "common.view_details": "Voir les Details",
    "common.call_us": "Appelez-nous",
    "common.directions": "Itineraire",
  },
};

const SUPPORTED_LOCALES: Locale[] = ["en", "es", "fr"];
const DEFAULT_LOCALE: Locale = "en";

/* ------------------------------------------------------------------ */
/*  Core functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Translate a key with optional variable interpolation.
 * Variables use {{variableName}} syntax.
 */
export function t(
  key: TranslationKey,
  locale: Locale = DEFAULT_LOCALE,
  vars: Record<string, string | number> = {},
): string {
  const bundle = TRANSLATIONS[locale] ?? TRANSLATIONS[DEFAULT_LOCALE];
  let text = bundle[key] ?? TRANSLATIONS[DEFAULT_LOCALE][key] ?? key;

  // Variable interpolation
  for (const [varName, value] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{\\{${varName}\\}\\}`, "g"), String(value));
  }

  return text;
}

/**
 * Detect locale from Accept-Language header or cookie.
 */
export function detectLocale(
  acceptLanguage?: string | null,
  cookieLocale?: string | null,
): Locale {
  // Cookie takes priority (user explicitly chose)
  if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale as Locale)) {
    return cookieLocale as Locale;
  }

  // Parse Accept-Language header
  if (acceptLanguage) {
    const langs = acceptLanguage
      .split(",")
      .map((part) => {
        const [lang, q] = part.trim().split(";q=");
        return { lang: lang.trim().substring(0, 2).toLowerCase(), q: q ? parseFloat(q) : 1 };
      })
      .sort((a, b) => b.q - a.q);

    for (const { lang } of langs) {
      if (SUPPORTED_LOCALES.includes(lang as Locale)) {
        return lang as Locale;
      }
    }
  }

  return DEFAULT_LOCALE;
}

/**
 * Get all available locales.
 */
export function getAvailableLocales(): Locale[] {
  return [...SUPPORTED_LOCALES];
}

/**
 * Get the full translation bundle for a locale.
 */
export function getTranslationBundle(locale: Locale): TranslationBundle {
  return {
    locale,
    translations: { ...TRANSLATIONS[locale] ?? TRANSLATIONS[DEFAULT_LOCALE] },
  };
}

/**
 * Get the display name for a locale.
 */
export function getLocaleDisplayName(locale: Locale): string {
  const names: Record<Locale, string> = {
    en: "English",
    es: "Espanol",
    fr: "Francais",
  };
  return names[locale] ?? locale;
}
