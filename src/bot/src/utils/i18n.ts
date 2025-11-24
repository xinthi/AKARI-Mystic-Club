// @ts-nocheck - This file is not type-checked by Next.js
import i18next from 'i18next';

const resources = {
  en: {
    translation: {
      welcome: '🔮 Welcome to AKARI Mystic Bot – Your tiny guardian of crypto quests! 🌟 Hunt airdrops, climb tiers (Seeker to Sovereign 🛡️), bet on predictions, earn EP with cute badges! 💫 Tiny tasks, big rewards. Start your mystic journey. #AkariClub',
      languageSelect: 'Select your language:',
      interestsSelect: 'Select roles (min 1):',
      walletTON: 'Enter TON wallet (verify later):',
      walletEVM: 'Enter EVM wallet (verify later):',
      onboardingComplete: '✅ Onboarding complete! You earned 5 bonus EP!',
      menuMain: 'View Profile 👤 | Tasks 📋 | Predictions 🎲',
      profile: 'Profile',
      tasks: 'Tasks',
      predictions: 'Predictions'
    }
  },
  es: {
    translation: {
      welcome: '🔮 ¡Bienvenido a AKARI Mystic Bot – Tu pequeño guardián de búsquedas cripto! 🌟 Caza airdrops, sube niveles (Buscador a Soberano 🛡️), apuesta en predicciones, gana EP con insignias lindas! 💫 Tareas pequeñas, grandes recompensas. Comienza tu viaje místico. #AkariClub',
      languageSelect: 'Selecciona tu idioma:',
      interestsSelect: 'Selecciona roles (mín 1):',
      walletTON: 'Ingresa wallet TON (verificar después):',
      walletEVM: 'Ingresa wallet EVM (verificar después):',
      onboardingComplete: '✅ ¡Onboarding completo! ¡Ganaste 5 EP de bonificación!',
      menuMain: 'Ver Perfil 👤 | Tareas 📋 | Predicciones 🎲',
      profile: 'Perfil',
      tasks: 'Tareas',
      predictions: 'Predicciones'
    }
  }
};

i18next.init({
  lng: 'en',
  fallbackLng: 'en',
  resources
});

export function t(key: string, lng: string = 'en'): string {
  return i18next.getFixedT(lng)(key);
}

export default i18next;

