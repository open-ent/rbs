#!/bin/bash

MVN_OPTS="-Duser.home=/var/maven"

if [ ! -e node_modules ]
then
  mkdir node_modules
fi

case `uname -s` in
  MINGW*)
    USER_UID=1000
    GROUP_UID=1000
    ;;
  *)
    if [ -z ${USER_UID:+x} ]
    then
      USER_UID=`id -u`
      GROUP_GID=`id -g`
    fi
esac

init() {
  me=`id -u`:`id -g`
  echo "DEFAULT_DOCKER_USER=$me" > .env
}

# Interface React (frontend/, Vite) : construite sur l'hôte puis rangée dans les ressources du module, pour que
# `./build.sh install` produise à lui seul le jar complet (AngularJS + React) — aucune copie à la main.
# Ancien bundle supprimé d'abord et échec franc : jamais un vieux bundle embarqué en silence.
# Prérequis : Node >= 18 (corepack) et NODE_AUTH_TOKEN (paquets @open-ent privés).
buildReact () {
  local fe dir
  for fe in frontend; do
    [ -f "$fe/package.json" ] || continue
    dir=$(dirname "$fe")
    echo "[buildReact] Construction de l'interface React ($fe)"
    (
      cd "$fe" || exit 1
      rm -rf dist
      corepack pnpm install --frozen-lockfile || exit 1
      corepack pnpm build || exit 1
      ls dist/public/*.js >/dev/null 2>&1 || { echo "[buildReact] aucun bundle dans dist/public : build React invalide"; exit 1; }
    ) || { echo "[buildReact] ÉCHEC ($fe)"; exit 1; }
    mkdir -p "$dir/src/main/resources/public"
    cp -r "$fe/dist/public/." "$dir/src/main/resources/public/"
  done
}

clean () {
  docker compose run --rm maven mvn $MVN_OPTS clean
}

install () {
  buildReact
   docker compose run --rm maven mvn $MVN_OPTS install -DskipTests -Dmaven.test.skip=true
 }

 test () {
   docker compose run --rm maven mvn $MVN_OPTS test
 }

buildNode () {
  #jenkins
  echo "[buildNode] Get branch name from jenkins env..."
  BRANCH_NAME=`echo $GIT_BRANCH | sed -e "s|origin/||g"`
  if [ "$BRANCH_NAME" = "" ]; then
    echo "[buildNode] Get branch name from git..."
    BRANCH_NAME=`git branch | sed -n -e "s/^\* \(.*\)/\1/p"`
  fi
  if [ "$BRANCH_NAME" = "" ]; then
    echo "[buildNode] Branch name should not be empty!"
    exit -1
  fi

  if [ "$BRANCH_NAME" = 'master' ]; then
      echo "[buildNode] Use entcore version from package.json ($BRANCH_NAME)"
      case `uname -s` in
        MINGW*)
          docker compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "npm install --no-bin-links && npm update entcore && node_modules/gulp/bin/gulp.js build"
          ;;
        *)
          docker compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "npm install && npm update entcore && node_modules/gulp/bin/gulp.js build"
      esac
  else
      echo "[buildNode] Use entcore tag $BRANCH_NAME"
      entcore_tags=$(npm dist-tags ls entcore)
      if [[ $entcore_tags == *"$BRANCH_NAME"* ]]; then
        case `uname -s` in
          MINGW*)
            docker compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "npm install --no-bin-links && npm rm --no-save entcore && npm install --no-save entcore@$BRANCH_NAME && node_modules/gulp/bin/gulp.js build"
                        ;;
          *)
            docker compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "npm install && npm rm --no-save entcore && npm install --no-save entcore@$BRANCH_NAME && node_modules/gulp/bin/gulp.js build"
        esac
      else
        case `uname -s` in
           MINGW*)
             docker compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "npm install --no-bin-links && node_modules/gulp/bin/gulp.js build"
                ;;
           *)
             docker compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "npm install && node_modules/gulp/bin/gulp.js build"
        esac
      fi
  fi
}

testNode () {
  rm -rf coverage
  rm -rf */build
  case `uname -s` in
    MINGW*)
      docker compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "npm install --no-bin-links && node_modules/gulp/bin/gulp.js drop-cache &&  npm test"
      ;;
    *)
      docker compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "npm install && node_modules/gulp/bin/gulp.js drop-cache && npm test"
  esac
}

publish() {
  version=`docker compose run --rm maven mvn $MVN_OPTS help:evaluate -Dexpression=project.version -q -DforceStdout`
  level=`echo $version | cut -d'-' -f3`
  case "$level" in
    *SNAPSHOT) export nexusRepository='snapshots' ;;
    *)         export nexusRepository='releases' ;;
  esac

  docker compose run --rm  maven mvn -DrepositoryId=ode-$nexusRepository -DskipTests --settings /var/maven/.m2/settings.xml deploy
}

publishNexus() {
  version=`docker compose run --rm maven mvn $MVN_OPTS help:evaluate -Dexpression=project.version -q -DforceStdout`
  level=`echo $version | cut -d'-' -f3`
  case "$level" in
    *SNAPSHOT) export nexusRepository='snapshots' ;;
    *)         export nexusRepository='releases' ;;
  esac
  docker compose run --rm  maven mvn -DrepositoryId=ode-$nexusRepository -Durl=$repo -DskipTests -Dmaven.test.skip=true --settings /var/maven/.m2/settings.xml deploy
}

for param in "$@"
do
  case $param in
    init)
      init
      ;;
    clean)
      clean
      ;;
    buildNode)
      buildNode
      ;;
    install)
      buildNode && install
      ;;
    publish)
      publish
      ;;
    publishNexus)
      publishNexus
      ;;
    test)
      test
      ;;
    testNode)
      testNode
      ;;
    *)
      echo "Invalid argument : $param"
  esac
  if [ ! $? -eq 0 ]; then
    exit 1
  fi
done

