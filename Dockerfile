# Use official Node.js as a parent image
FROM node:18 AS build

# Set the working directory
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package.json and pnpm-lock.yaml before other files
COPY package.json pnpm-lock.yaml ./

# Install project dependencies
RUN pnpm install

# Copy all files to the working directory
COPY . .

# Build the project
RUN pnpm build

# Production stage
FROM node:18 AS production

# Set the working directory
WORKDIR /app

# Copy the necessary files from the build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/resources ./resources

# Install only production dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod

# Command to run the application
CMD [ "node", "dist/index.js" ]
