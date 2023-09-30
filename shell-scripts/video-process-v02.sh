#!/bin/bash

PIDFILE="/tmp/video-process-action.pid"

create_pidfile () {
  echo $$ > "$PIDFILE"
}

remove_pidfile () {
  [ -f "$PIDFILE" ] && rm "$PIDFILE"
}

previous_instance_active () {

  local prevpid
  if [ -f "$PIDFILE" ]; then
    prevpid=$(cat "$PIDFILE")
    kill -0 $prevpid 
  else 
    false
  fi
}

do_the_action () {

  echo 'Moving MJR files: Started...'
  cd /opt/janus/share/janus/recordings/ 
  find . -iname '*.mjr' -exec mv -t /storage/recordings/ {} +
  echo 'Moving MJR files: Finished'

  echo 'Organizing MJR files: Started...'
  cd /storage/recordings/

  for FILE in videoroom-*.mjr
  do
    if [ -f "$FILE" ]; then
      FOLDER=$(echo $FILE| cut -d'-' -f 2)
      if [ -d $FOLDER ]
      then
        echo "${FOLDER} does exist" > /dev/null
      else
        mkdir $FOLDER
      fi

      # Organizing files
      find . -iname "videoroom-${FOLDER}*.mjr" -exec mv -t $FOLDER {} + > /dev/null 2>&1
      curl http://127.0.0.1:5000/videos/"$FOLDER" -o "$FOLDER/$FOLDER.txt" >/dev/null 2>&1
      echo "Done processing files for folder: $FOLDER"
    fi
  done
  echo 'Organizing MJR files: Finished...'
}

if previous_instance_active
then 
  date +'PID: $$ Previous instance is still active at %H:%M:%S, aborting ... '
else 
  trap remove_pidfile EXIT
  create_pidfile
  do_the_action
fi
