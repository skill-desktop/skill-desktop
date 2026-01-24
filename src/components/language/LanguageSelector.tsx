import React from "react";
import { useTranslation } from "react-i18next";
import { Globe, Check } from "lucide-react";
import { supportedLanguages, changeLanguage, type SupportedLanguage } from "@/i18n";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, ScrollArea } from "@/components/ui";
import { cn } from "@/lib/utils";

interface LanguageSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLanguageSelected?: (language: SupportedLanguage) => void;
  showContinueButton?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  open,
  onOpenChange,
  onLanguageSelected,
  showContinueButton = true,
}) => {
  const { t, i18n } = useTranslation();
  const [selectedLanguage, setSelectedLanguage] = React.useState<SupportedLanguage>(
    i18n.language as SupportedLanguage
  );

  const handleLanguageSelect = async (lang: SupportedLanguage) => {
    setSelectedLanguage(lang);
    await changeLanguage(lang);
  };

  const handleContinue = () => {
    onLanguageSelected?.(selectedLanguage);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-accent-blue" />
            <DialogTitle>{t("languageSelector.title")}</DialogTitle>
          </div>
          <DialogDescription>
            {t("languageSelector.description")}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-80">
          <div className="grid gap-1 p-1">
            {supportedLanguages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageSelect(lang.code)}
                className={cn(
                  "flex items-center justify-between rounded-md px-3 py-2.5 text-left transition-colors",
                  selectedLanguage === lang.code
                    ? "bg-accent-blue/10 text-accent-blue"
                    : "hover:bg-bg-tertiary text-text-primary"
                )}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{lang.nativeName}</span>
                  <span className="text-xs text-text-muted">{lang.name}</span>
                </div>
                {selectedLanguage === lang.code && (
                  <Check className="h-4 w-4 text-accent-blue" />
                )}
              </button>
            ))}
          </div>
        </ScrollArea>

        {showContinueButton && (
          <DialogFooter>
            <Button onClick={handleContinue} className="w-full">
              {t("languageSelector.continue")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

// Dropdown version for settings page
interface LanguageDropdownProps {
  value: SupportedLanguage;
  onChange: (language: SupportedLanguage) => void;
}

export const LanguageDropdown: React.FC<LanguageDropdownProps> = ({
  value,
  onChange,
}) => {
  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value as SupportedLanguage;
    await changeLanguage(newLang);
    onChange(newLang);
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      className="h-9 rounded-md border border-border-default bg-bg-secondary px-3 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
    >
      {supportedLanguages.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.nativeName}
        </option>
      ))}
    </select>
  );
};
