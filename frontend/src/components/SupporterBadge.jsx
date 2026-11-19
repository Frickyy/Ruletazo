import { t } from "../i18n/index.js";

/** Insignia para quienes apoyan el proyecto (SUPPORTER_STEAM_IDS en el backend). */
function SupporterBadge() {
  return (
    <span className="supporter-badge" title={t("Apoya el proyecto")}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
      </svg>
      <span>Supporter</span>
    </span>
  );
}

export default SupporterBadge;
