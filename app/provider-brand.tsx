type ProviderBrandProps = {
  provider: string;
  className?: string;
};

const brandStyles: Record<string, { color: string; background: string }> = {
  Salesforce: { color: "#00A1E0", background: "#F2FBFF" },
  HubSpot: { color: "#FF7A59", background: "#FFF6F2" },
  Slack: { color: "#4A154B", background: "#FFF8FF" },
  "Google Sheets": { color: "#0F9D58", background: "#F2FBF6" },
  "Customer 360": { color: "#16888A", background: "#F0FAFA" },
};

function SalesforceLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10.01 5.42a4.2 4.2 0 0 1 3.04-1.31c1.56 0 2.96.9 3.69 2.2a5.01 5.01 0 0 1 2.1-.45A5.19 5.19 0 0 1 24 11.08a5.2 5.2 0 0 1-5.18 5.22c-.34 0-.69-.04-1.02-.1a3.75 3.75 0 0 1-4.95 1.57 4.3 4.3 0 0 1-3.97 2.63 4.3 4.3 0 0 1-4.05-2.82c-.27.06-.54.08-.82.08A4.03 4.03 0 0 1 0 13.6c0-1.5.81-2.8 2.01-3.5a4.6 4.6 0 0 1-.39-1.85A4.65 4.65 0 0 1 6.27 3.6c1.53 0 2.85.7 3.74 1.82Z"
      />
    </svg>
  );
}

function HubSpotLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12.8 8.2v-3m-5.4 5L5 8.8m9.8 6.7 2.4 2.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <circle cx="12.8" cy="12" r="4" fill="currentColor" />
      <circle cx="12.8" cy="3.6" r="2.1" fill="currentColor" />
      <circle cx="3.8" cy="8.1" r="2.1" fill="currentColor" />
      <circle cx="18.6" cy="19" r="2.1" fill="currentColor" />
      <circle cx="12.8" cy="12" r="1.45" fill="white" />
    </svg>
  );
}

function GoogleSheetsLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 2.5h8.3L19 7.2v14.3H6V2.5Z"
      />
      <path fill="#87CFA6" d="M14.3 2.5v4.7H19l-4.7-4.7Z" />
      <path
        d="M9 10.2h7M9 13.6h7M9 17h7M11.3 10.2V17"
        fill="none"
        stroke="white"
        strokeWidth="1.25"
      />
    </svg>
  );
}

function SlackLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9.4" y="2" width="4.1" height="9" rx="2.05" fill="#36C5F0" />
      <circle cx="7.35" cy="9.4" r="2.05" fill="#36C5F0" />
      <rect x="13" y="9.4" width="9" height="4.1" rx="2.05" fill="#2EB67D" />
      <circle cx="14.6" cy="7.35" r="2.05" fill="#2EB67D" />
      <rect x="10.5" y="13" width="4.1" height="9" rx="2.05" fill="#ECB22E" />
      <circle cx="16.65" cy="14.6" r="2.05" fill="#ECB22E" />
      <rect x="2" y="10.5" width="9" height="4.1" rx="2.05" fill="#E01E5A" />
      <circle cx="9.4" cy="16.65" r="2.05" fill="#E01E5A" />
    </svg>
  );
}

function ProviderLogo({ provider }: { provider: string }) {
  if (provider === "Salesforce") return <SalesforceLogo />;
  if (provider === "HubSpot") return <HubSpotLogo />;
  if (provider === "Slack") return <SlackLogo />;
  if (provider === "Google Sheets") return <GoogleSheetsLogo />;
  return <span className="text-xs font-semibold">{provider.slice(0, 2)}</span>;
}

export function ProviderBrand({
  provider,
  className = "",
}: ProviderBrandProps) {
  const style = brandStyles[provider] ?? {
    color: "#52605F",
    background: "#F3F6F5",
  };

  return (
    <span
      className={`provider-brand ${className}`}
      style={{ color: style.color, backgroundColor: style.background }}
      role="img"
      aria-label={`${provider} logo`}
      title={provider}
    >
      <ProviderLogo provider={provider} />
    </span>
  );
}
