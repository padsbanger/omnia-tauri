import { JSX, useState } from "react";
import { BiLogoGmail, BiLogoMicrosoftTeams } from "react-icons/bi";
import { FaDiscord, FaTelegramPlane, FaWhatsapp } from "react-icons/fa";
import { FaFacebookMessenger } from "react-icons/fa";
import { SiClaude, SiOpenai, SiTradingview } from "react-icons/si";
import { FaSquareXTwitter } from "react-icons/fa6";
import { FaSpotify } from "react-icons/fa";
import { FaSlack } from "react-icons/fa6";
import { FiLink } from "react-icons/fi";
import { isSafeFaviconUrl } from "../../common/utils/getSafeFaviconUrl";

const IconsDict: Record<string, JSX.Element> = {
  claude: <SiClaude />,
  chatgpt: <SiOpenai />,
  facebook: <FaFacebookMessenger />,
  gmail: <BiLogoGmail />,
  discord: <FaDiscord />,
  tradingview: <SiTradingview />,
  spotify: <FaSpotify />,
  twitter: <FaSquareXTwitter />,
  slack: <FaSlack />,
  telegram: <FaTelegramPlane />,
  whatsapp: <FaWhatsapp />,
  teams: <BiLogoMicrosoftTeams />,
  link: <FiLink />,
};

export const WindowIcon = ({
  icon,
  faviconUrl,
  className = "text-3xl",
}: {
  icon: string;
  faviconUrl?: string;
  className?: string;
}) => {
  const safeFaviconUrl =
    faviconUrl !== undefined && isSafeFaviconUrl(faviconUrl)
      ? faviconUrl
      : undefined;
  const [failedFaviconUrl, setFailedFaviconUrl] = useState<string | null>(null);
  const shouldShowFavicon =
    safeFaviconUrl !== undefined && safeFaviconUrl !== failedFaviconUrl;

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center ${className}`}
    >
      {shouldShowFavicon ? (
        <img
          alt=""
          aria-hidden="true"
          className="h-[1em] w-[1em] object-contain"
          draggable={false}
          onError={() => setFailedFaviconUrl(safeFaviconUrl)}
          referrerPolicy="no-referrer"
          src={safeFaviconUrl}
        />
      ) : (
        (IconsDict[icon] ?? IconsDict.link)
      )}
    </span>
  );
};
