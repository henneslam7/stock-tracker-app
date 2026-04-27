import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    files: ['*.rules'],
    plugins: {
      firebaseRulesPlugin
    },
    rules: {
      ...firebaseRulesPlugin.configs.recommended.rules
    }
  }
];
