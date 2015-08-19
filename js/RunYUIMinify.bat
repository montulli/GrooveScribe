copy /b jsmidgen.js+groove_utils.js+groove_writer.js+grooves.js groove_writer_combined.js
copy /b jsmidgen.js+groove_utils.js+groove_display.js  groove_display_combined.js
@"E:\Program Files (x86)\Java\jre7\bin\java.exe" -jar ../jstools/yuicompressor-2.4.8.jar -o groove_writer.min.js groove_writer_combined.js
@"E:\Program Files (x86)\Java\jre7\bin\java.exe" -jar ../jstools/yuicompressor-2.4.8.jar -o groove_display.min.js groove_display_combined.js 
del /f groove_writer_combined.js
del /f groove_display_combined.js
pause