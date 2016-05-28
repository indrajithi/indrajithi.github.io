---
layout: post
title: Music Visualizer in C++ Using OpenGL Part 1
modified:
categories: blog
excerpt: For the given input audio file (.wav) the program will give the real time audio spectrum by performing Fast Fourier Transform (FFT) on the audio samples and plot the graph using OpenGL. 
tags: [C++,OpenGL]
image:
  feature:
date: 2016-05-25T21:01:43+05:30
---

![Audio Visualizer](/images/spectrum.gif "Screenshot of spectrum")

# Audio Visualizer

For the given input audio file **(.wav)** the program will give the **real time audio spectrum** by performing **Fast Fourier Transform (FFT)** on the audio samples and plot the graph using **OpenGL**.
This Project is implemented in C++ using OpenGL. Three frameworks **Aquila-dsp**, **Kiss-Fft**, and **SFML** are used to perform audio sampling, fast fourier transform and audio playback respectively. The development and testing of this project is done on **Linux (ubuntu)** using 4.2.0-16-generic Kernel. Interface for the program is given with the help of keyboard.  

## Frameworks / APIs used
 1. The following c++ frameworks are used in this project.
 2 Simple and Fast Multimedia Library (SFML)
 3. Aquila-dsp
 4. Kiss-fft 
 5. OpenGL

## Minimum requirements:
The development of the project was done with these requirements. The can support lower versions also. It has not been tested.
 
 * C++ compiler : g++ with c++11 support (-std=gnu++11) (version >= 5.2.1)
 * OpenGL (version >=v4.5)
 * Aquila-dsp framework (version >=v3.0)
 * Kiss-fft Framework (version >=v1.3.0)
 * SFML framework  >=2.3.2
 * Git >=v2.5.0

## Keys Used:
{% highlight text %}

Use `Left/Right` to move horizontally.
        Use `Up/Down` to change the horizontal scale.
        Use `Home` button to reset the position and scale.
        Press ` F7 ` to toggle interpolation.
        Press  `F8` to toggle clamping.
Press `F9` to toggle drawing points.
        Press `q` to exit the program.
        Press `p` to to toggle audio play/pause.
        Press `r` to reload audio and play from the beginning.    
Press `right arrow` to seek audio forward by 5 seconds and move +ve x axis.
Press `left arrow` to seek audio backward by 5 seconds and move -ve x axis.
Press `down arrow` to decrease scale/1.5.
Press `up arrow` to increase scale*1.5.
{% endhighlight %}

## Algorithm
{% highlight text %}

Step 1: Begin
		Int framePointer = 0, N = 32768.
Step 2: Load input audio file and play it using the audio Library
Step 3: For i = framePointer to →  framePointer + N < total_samples_count
		Collect N samples from the audio file 
Step 4: Apply suitable window function (e.g. Hann aka Hanning window)
Step 5: Apply Fast Fourier transform (FFT) on the array elements and collect N/2 
		Complex numbers having real part and imaginary part. 
		(NB: if using typical complex-to-complex FFT then set imaginary parts 
		of input array to zero)
Step 6: Calculate the magnitude of N/2FFT data.
		magnitude = sqrt(re * re +img *img) 
Step 7: Convert magnitude to dB (log)scale. (optional)
		20 * log10(magnitude)
Step 8: Plot N/2  log(magnitude)values.
Step 9: If N >= total_samples_count 
        Exit. 
        Else goto Step 3.
Step 10: End.
{% endhighlight %}	
## Flow Chart
![Flow Chart](/flowchart.png "Flowchart")

## Compiling the frameworks

## Aquila-dsp:
**Prerequisites**

CMake: Aquila relies on CMake as a build tool, so make sure you have it installed (version 2.8 or later)
Clone repository.

```
git clone git://github.com/zsiciarz/aquila.git aquila-src
```
**Buid**

Where to build:

```
a-top-level-directory/
   aquila-build/
   aquila-src/
```
In directory you have to build do

```
cmake ..\aquila-src
    -DCMAKE_INSTALL_PREFIX=”~/home/mylib”
make
make install
```
**SFLM:**

Installing SFML is simple. You need administrative privilege on the machine

```
sudo apt-get install libsfml-dev
```
**Kiss FFT**

There is no need to build kiss-fft. You need to add their files while compiling

## Compiling and running

For easy compilation use the script `./compile` from the project directory

{% highlight bash %}
g++ -std=c++11 -c draw.cpp
g++ -std=gnu++11 draw.o  \
kiss_fft130/kiss_fft.c  \
-L /home/<YourUserName>/mylib/lib/ \
-lAquila -lOoura_fft -lm \
-lglut -lGLEW -lGL -lGLU  \
-lfreetype -lsfml-system \
-lsfml-audio  ./common/shader_utils.o \
-o draw
To run the project: 
./draw <audio-input>
{% endhighlight %}

**[>> Part 2](/blog/music-visualizer-in-c-using-opengl-part-2/)**

**[Full Source Code.](https://github.com/indrajithi/Audio-Visualizer)**
