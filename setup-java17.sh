#!/bin/bash

echo "🔧 Configuration de Java 17 pour Android..."

# Vérifier si Java 17 est installé
JAVA17_HOME=$(/usr/libexec/java_home -v 17 2>/dev/null)

if [ -z "$JAVA17_HOME" ]; then
    echo "❌ Java 17 n'est pas installé."
    echo ""
    echo "📦 Installez Java 17 avec :"
    echo "   brew install --cask temurin@17"
    echo ""
    exit 1
fi

echo "✅ Java 17 trouvé : $JAVA17_HOME"

# Configurer JAVA_HOME pour cette session
export JAVA_HOME="$JAVA17_HOME"
export PATH="$JAVA_HOME/bin:$PATH"

echo "✅ JAVA_HOME configuré : $JAVA_HOME"
echo ""

# Vérifier la version
java -version

echo ""
echo "📝 Pour rendre cette configuration permanente, ajoutez à votre ~/.zshrc :"
echo "   export JAVA_HOME=\$(/usr/libexec/java_home -v 17)"
echo "   export PATH=\"\$JAVA_HOME/bin:\$PATH\""
echo ""
echo "💡 Vous pouvez maintenant lancer : npx expo run:android"

