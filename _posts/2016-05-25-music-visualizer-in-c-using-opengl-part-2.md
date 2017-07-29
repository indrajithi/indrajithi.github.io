---
layout: post
title: Music Visualizer in C++ Using OpenGL Part 2
modified:
categories: blog
excerpt:
tags: []
image:
  feature:
date: 2016-05-25T21:57:36+05:30
---

Now I assume that you have installed all the requirements needed for the visualizer. 
If not read **[Part 1](/blog/music-visualizer-in-c-using-opengl-part-1/)**.

We are using the graph from **[OpenGL Programming/Scientific OpenGL Tutorial 02](https://en.wikibooks.org/wiki/OpenGL_Programming/Scientific_OpenGL_Tutorial_02)** for plotting the spectrum. Full source code for the graph is available [here](https://gitlab.com/wikibooks-opengl/modern-tutorials/tree/master/graph02). 

Lets create a file `draw.cpp` and add a `main` function. We pass `.wav` file as an argument.



{% highlight c++ %}
int main(int argc, char *argv[]) 
{
	if (argc < 2)
    {
        std::cout << "Usage: wave_iteration <FILENAME>" << std::endl;
        return 1;
    }
{% endhighlight %}

To play the music we are using **SFML**. So lets write code for that.
Before that we need to create an object `sf::Music music;`. Add it to the global part.

{% highlight c++ %}
 //sfm play music

 	if (!music.openFromFile(fileName))
       		return -1; 
 
 // find the total music duration
 	totalMusicDuration = music.getDuration ();
{% endhighlight %}

Initializing the OpenGL. See this [tutorial](https://en.wikibooks.org/wiki/OpenGL_Programming/Scientific_OpenGL_Tutorial_02) for better understanding the graph used here.
{% highlight c++ %}

	glutInit(&argc, argv);
	glutInitDisplayMode(GLUT_RGB);
	glutInitWindowSize(640, 480);
	glutCreateWindow("My Graph");

	GLenum glew_status = glewInit();

	if (GLEW_OK != glew_status) {
		fprintf(stderr, "Error: %s\n", glewGetErrorString(glew_status));
		return 1;
	}

	if (!GLEW_VERSION_2_0) {
		fprintf(stderr, "No support for OpenGL 2.0 found\n");
		return 1;
	}

	GLint max_units;

	glGetIntegerv(GL_MAX_VERTEX_TEXTURE_IMAGE_UNITS, &max_units);
	if (max_units < 1) {
		fprintf(stderr, "Your GPU does not have any vertex texture image units\n");
		return 1;
	}

	GLfloat range[2];

	glGetFloatv(GL_ALIASED_POINT_SIZE_RANGE, range);
	if (range[1] < 5.0)
		fprintf(stderr, "WARNING: point sprite range (%f, %f) too small\n", range[0], range[1]);
	
{% endhighlight %}

Now we need to get the points to plot. `getData()` is the function we fetch to get N/2 
points in to the array. `music.play()` plays the music been loaded. 

{% highlight c++ %}
	getData();

	music.play();
{% endhighlight %}

Now lets call some OpenGL function to plot the spectrum.

{% highlight c++ %}
if (init_resources()) {

		glutDisplayFunc(display);
		glutSpecialFunc(special);
		glutIdleFunc(moveWav);
		glutKeyboardFunc(key);
		glutMainLoop();
	}

	free_resources();
	return 0;
}

{% endhighlight %}

Create a file `visualizer.hpp` and add the following codes.

{% highlight c++ %}

#include <stdio.h>
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <GL/glew.h>
#include <GL/glut.h>
#include "common/shader_utils.h"
#include <SFML/Audio.hpp>
#include "aquila/source/WaveFile.h"
#include <iostream>
#include <functional>
#include <memory>
#include <chrono>
#include <thread>
#include <string.h>
#include <sys/time.h>
//kissFFT
#include "kiss_fft130/kiss_fft.h"
#ifndef M_PI
#define M_PI 3.14159265358979324
#endif

{% endhighlight %}

This completes the `main` function. Here is the complete code for the function.

{% highlight c++ %}
#include "visualizer.hpp"

#define N 10000

typedef unsigned long long timestamp_t;
  static timestamp_t
    get_timestamp ()
    {
      struct timeval now;
      gettimeofday (&now, NULL);
      return  now.tv_usec + (timestamp_t)now.tv_sec * 1000000;
    }

GLuint program;
GLint attribute_coord1d;
GLint uniform_offset_x;
GLint uniform_scale_x;
GLuint texture_id;
GLint uniform_mytexture;

float offset_x = 0.0;
float scale_x =1.0;
bool interpolate = false;
bool clamp = false;
bool showpoints = true;

GLuint vbo;
int graph[N/2]; 
int framePointer = 0;
char fileName[50];
bool calledFromInit = true;
bool dataEnd = false;
bool playFlag = true;
bool muteFlag = false;

sf::Time totalMusicDuration;
sf::Time timePlay;
sf::Music music;
sf::Time timePlay;

kiss_fft_cpx in[N],out[N];

timestamp_t tmain;

void getData();
void display();

int main(int argc, char *argv[]) 
{
	if (argc < 2)
    {
        std::cout << "Usage: wave_iteration <FILENAME>" << std::endl;
        return 1;
    }
    strcpy(fileName, argv[1]);
	tmain = get_timestamp();
   //sfm play music
 	if (!music.openFromFile(fileName))
       		return -1; 


	totalMusicDuration = music.getDuration ();

	glutInit(&argc, argv);
	glutInitDisplayMode(GLUT_RGB);
	glutInitWindowSize(640, 480);
	glutCreateWindow("My Graph");

	GLenum glew_status = glewInit();

	if (GLEW_OK != glew_status) {
		fprintf(stderr, "Error: %s\n", glewGetErrorString(glew_status));
		return 1;
	}

	if (!GLEW_VERSION_2_0) {
		fprintf(stderr, "No support for OpenGL 2.0 found\n");
		return 1;
	}

	GLint max_units;

	glGetIntegerv(GL_MAX_VERTEX_TEXTURE_IMAGE_UNITS, &max_units);
	if (max_units < 1) {
		fprintf(stderr, "Your GPU does not have any vertex texture image units\n");
		return 1;
	}

	GLfloat range[2];

	glGetFloatv(GL_ALIASED_POINT_SIZE_RANGE, range);
	if (range[1] < 5.0)
		fprintf(stderr, "WARNING: point sprite range (%f, %f) too small\n", range[0], range[1]);
	
	
	printf("------------------------------------------------------\n\n");
	printf("Use left/right to move horizontally.And seek audio by +/-5 sec\n");
	printf("Use up/down to change the horizontal scale.\n");
	printf("Press home to reset the position and scale.\n");
	printf("Press F7 to toggle interpolation.\n");
	printf("Press F8 to toggle clamping.\n");
	printf("Press F9 to toggle drawing points.\n");
	printf("Press q to exit.\n");
	printf("Press p to toggle Play/Pause audio.\n");
	printf("Press r to reload and play audio.\n");
	printf("------------------------------------------------------\n\n");

	
	getData();

	music.play();

	if (init_resources()) {

		glutDisplayFunc(display);
		glutSpecialFunc(special);
		glutIdleFunc(moveWav);
		glutKeyboardFunc(key);
		glutMainLoop();
	}

	free_resources();
	return 0;
}
{% endhighlight %}

**[>> Part 3](/blog/music-visualizer-in-c-using-opengl-part-3/)**

**[Full Source Code.](https://github.com/indrajithi/Audio-Visualizer)**


